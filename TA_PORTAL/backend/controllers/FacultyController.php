<?php
declare(strict_types=1);

/**
 * Validates that an application choice belongs to a TA position assigned to the logged-in faculty.
 */
function verifyFacultyChoiceOwnership(PDO $pdo, int $choiceId, int $facultyUserId): array {
    $stmt = $pdo->prepare('
        SELECT ac.application_choice_id, ac.workflow_status, ac.application_id, 
               p.position_id, p.faculty_user_id, p.weekly_hours, p.status AS position_status,
               c.course_code, c.course_name, p.section_code, a.student_user_id
        FROM application_choices ac
        JOIN ta_positions p ON ac.position_id = p.position_id
        JOIN courses c ON p.course_id = c.course_id
        JOIN applications a ON ac.application_id = a.application_id
        WHERE ac.application_choice_id = ?
    ');
    $stmt->execute([$choiceId]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('Candidate record not found.', 404);
    }
    if ((int)$row['faculty_user_id'] !== $facultyUserId) {
        fail('Unauthorized: You do not own this course/section position.', 403);
    }
    return $row;
}

/**
 * Validates that a TA assignment belongs to a TA position assigned to the logged-in faculty.
 */
function verifyFacultyAssignmentOwnership(PDO $pdo, int $identifier, int $facultyUserId): array {
    $stmt = $pdo->prepare('
        SELECT ta.assignment_id, ta.position_id, ta.student_user_id, ta.assigned_hours,
               p.faculty_user_id, c.course_code, p.section_code
        FROM ta_assignments ta
        JOIN ta_positions p ON ta.position_id = p.position_id
        JOIN courses c ON p.course_id = c.course_id
        WHERE ta.assignment_id = ? OR ta.application_choice_id = ?
        LIMIT 1
    ');
    $stmt->execute([$identifier, $identifier]);
    $row = $stmt->fetch();
    if (!$row) {
        fail('TA assignment record not found.', 404);
    }
    if ((int)$row['faculty_user_id'] !== $facultyUserId) {
        fail('Unauthorized: You do not supervise this TA assignment.', 403);
    }
    return $row;
}

function handleFaculty(PDO $pdo, string $action, string $method): void {
    if ($method !== 'POST') fail('Method not allowed.', 405);
    $user = requireRole($pdo, 'Faculty');
    $facultyUserId = (int)$user['user_id'];
    $d = requestData();

    switch ($action) {
        case 'schedule_interview':
            $choiceId = (int)($d['choiceId'] ?? 0);
            $target = verifyFacultyChoiceOwnership($pdo, $choiceId, $facultyUserId);

            $scheduledAt = trim($d['scheduledAt'] ?? '');
            if (!$scheduledAt) fail('Interview date and time are required.');
            $interviewType = (!empty($d['interviewType']) && str_starts_with($d['interviewType'], 'Online')) ? 'Online' : 'In-Person';
            $notes = trim($d['notes'] ?? '');

            // Insert or update interview record
            $stmt = $pdo->prepare('
                INSERT INTO interviews (application_choice_id, scheduled_at, interview_type, notes, status)
                VALUES (?, ?, ?, ?, "Scheduled")
                ON DUPLICATE KEY UPDATE 
                    scheduled_at = VALUES(scheduled_at),
                    interview_type = VALUES(interview_type),
                    notes = VALUES(notes),
                    status = "Scheduled"
            ');
            $stmt->execute([$choiceId, $scheduledAt, $interviewType, $notes]);

            // Update workflow status to Interview
            $pdo->prepare('UPDATE application_choices SET workflow_status = "Interview" WHERE application_choice_id = ?')->execute([$choiceId]);

            // Notify student
            $prettyDate = date('d M Y, h:i A', strtotime($scheduledAt));
            makeNotification($pdo, (int)$target['student_user_id'], 'Interview Scheduled', "Your interview for {$target['course_code']} Section {$target['section_code']} has been scheduled for {$prettyDate}.", 'Interview');

            ok([], 'Interview scheduled successfully.');
            break;

        case 'save_interview_evaluation':
            $choiceId = (int)($d['choiceId'] ?? 0);
            $target = verifyFacultyChoiceOwnership($pdo, $choiceId, $facultyUserId);

            $tech = (int)($d['technical'] ?? 0);
            $prob = (int)($d['problem'] ?? 0);
            $comm = (int)($d['communication'] ?? 0);
            $teach = (int)($d['teaching'] ?? 0);

            // Validation: Exactly 1-5 for all four sections
            if ($tech < 1 || $tech > 5 || $prob < 1 || $prob > 5 || $comm < 1 || $comm > 5 || $teach < 1 || $teach > 5) {
                fail('Interview evaluation scores must be between 1 and 5 for each section.');
            }

            $decision = ($d['decision'] ?? '') === 'Passed' ? 'Passed' : 'Failed';
            $comments = trim($d['comments'] ?? '');

            // Find interview record
            $stmt = $pdo->prepare('SELECT interview_id FROM interviews WHERE application_choice_id = ? ORDER BY interview_id DESC LIMIT 1');
            $stmt->execute([$choiceId]);
            $interviewId = $stmt->fetchColumn();
            if (!$interviewId) {
                fail('No interview record found for this candidate. Please schedule the interview first.');
            }
            $interviewId = (int)$interviewId;

            // Insert into interview_evaluations (Authoritative 20-mark model)
            $evalStmt = $pdo->prepare('
                INSERT INTO interview_evaluations (interview_id, technical_knowledge, problem_solving, communication, teaching_ability, comments, decision, evaluated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    technical_knowledge = VALUES(technical_knowledge),
                    problem_solving = VALUES(problem_solving),
                    communication = VALUES(communication),
                    teaching_ability = VALUES(teaching_ability),
                    comments = VALUES(comments),
                    decision = VALUES(decision),
                    evaluated_by = VALUES(evaluated_by)
            ');
            $evalStmt->execute([$interviewId, $tech, $prob, $comm, $teach, $comments, $decision, $facultyUserId]);

            // Mark interview completed
            $pdo->prepare('UPDATE interviews SET status = "Completed" WHERE interview_id = ?')->execute([$interviewId]);

            // Set workflow status: Passed or Failed (distinct from Admin Rejected)
            $pdo->prepare('UPDATE application_choices SET workflow_status = ? WHERE application_choice_id = ?')->execute([$decision, $choiceId]);

            // Notify student
            $statusMsg = $decision === 'Passed' 
                ? "Congratulations! You have passed the interview for {$target['course_code']} Section {$target['section_code']}."
                : "Thank you for interviewing. You were not selected for {$target['course_code']} Section {$target['section_code']}.";
            makeNotification($pdo, (int)$target['student_user_id'], "Interview Result: {$decision}", $statusMsg, 'Interview');

            ok([], "Interview evaluation recorded ({$decision}).");
            break;

        case 'assign_ta':
            $choiceId = (int)($d['choiceId'] ?? 0);
            $target = verifyFacultyChoiceOwnership($pdo, $choiceId, $facultyUserId);

            // 1. Candidate must have passed the interview
            if ($target['workflow_status'] !== 'Passed') {
                fail('Candidate must have Passed the interview before being assigned.');
            }

            // 2. Position must be Open
            if ($target['position_status'] !== 'Open') {
                fail('This TA position is already assigned or closed.');
            }

            $positionId = (int)$target['position_id'];
            $studentUserId = (int)$target['student_user_id'];
            // 3. Load assigned hours strictly from position weekly_hours
            $weeklyHours = (int)$target['weekly_hours'];

            // 4. Check that no active assignment already exists for this position
            $chkStmt = $pdo->prepare('SELECT assignment_id FROM ta_assignments WHERE position_id = ?');
            $chkStmt->execute([$positionId]);
            if ($chkStmt->fetch()) {
                fail('This position already has an active TA assigned.');
            }

            $pdo->beginTransaction();
            try {
                // Insert TA assignment
                $stmt = $pdo->prepare('INSERT INTO ta_assignments (application_choice_id, position_id, student_user_id, assigned_hours) VALUES (?, ?, ?, ?)');
                $stmt->execute([$choiceId, $positionId, $studentUserId, $weeklyHours]);

                // Atomically update choice and position status
                $pdo->prepare('UPDATE application_choices SET workflow_status = "Assigned" WHERE application_choice_id = ?')->execute([$choiceId]);
                $pdo->prepare('UPDATE ta_positions SET status = "Assigned" WHERE position_id = ?')->execute([$positionId]);

                $pdo->commit();

                makeNotification($pdo, $studentUserId, 'TA Assignment Confirmed', "Congratulations! You have been officially assigned as Teaching Assistant for {$target['course_code']} Section {$target['section_code']} ({$weeklyHours} hrs/week).", 'Assignment');
                ok([], 'TA assigned successfully.');
            } catch (Exception $e) {
                $pdo->rollBack();
                fail('Database error during TA assignment: ' . $e->getMessage());
            }
            break;

        case 'save_ta_evaluation':
            $assignmentId = (int)($d['assignmentId'] ?? 0);
            $asg = verifyFacultyAssignmentOwnership($pdo, $assignmentId, $facultyUserId);

            $rating = (int)($d['rating'] ?? 0);
            if ($rating < 1 || $rating > 5) {
                fail('Evaluation rating must be between 1 and 5.');
            }
            $feedback = trim($d['feedback'] ?? '');
            if (!$feedback) {
                fail('Evaluation feedback comments are required.');
            }

            $stmt = $pdo->prepare('
                INSERT INTO ta_performance_evaluations (assignment_id, evaluator_id, rating, feedback)
                VALUES (?, ?, ?, ?)
            ');
            $stmt->execute([(int)$asg['assignment_id'], $facultyUserId, $rating, $feedback]);

            ok([], 'TA performance evaluation saved successfully.');
            break;

        case 'report_ta_issue':
            $assignmentId = (int)($d['assignmentId'] ?? 0);
            $asg = verifyFacultyAssignmentOwnership($pdo, $assignmentId, $facultyUserId);

            $issue = trim($d['issue'] ?? '');
            if (!$issue) {
                fail('Incident details are required.');
            }

            $stmt = $pdo->prepare('
                INSERT INTO ta_performance_evaluations (assignment_id, evaluator_id, rating, feedback, incident_report)
                VALUES (?, ?, 3, "Faculty Incident Report", ?)
            ');
            $stmt->execute([(int)$asg['assignment_id'], $facultyUserId, $issue]);

            ok([], 'TA incident report submitted successfully.');
            break;

        case 'send_certificate':
            $assignmentId = (int)($d['assignmentId'] ?? 0);
            $asg = verifyFacultyAssignmentOwnership($pdo, $assignmentId, $facultyUserId);

            makeNotification(
                $pdo,
                (int)$asg['student_user_id'],
                'Certificate Awarded',
                "Congratulations! Your faculty supervisor has awarded you an official TA Certificate of Appreciation for {$asg['course_code']} Section {$asg['section_code']}.",
                'Certificate'
            );

            ok([], 'Certificate sent to student.');
            break;

        case 'generate_certificate':
            $assignmentId = (int)($d['assignmentId'] ?? 0);
            $asg = verifyFacultyAssignmentOwnership($pdo, $assignmentId, $facultyUserId);
            ok(['assignmentId' => (int)$asg['assignment_id']], 'Certificate verified.');
            break;
    }
}
