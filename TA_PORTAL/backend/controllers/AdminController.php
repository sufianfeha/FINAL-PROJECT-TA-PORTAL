<?php
declare(strict_types=1);

function handleAdmin(PDO $pdo, string $action, string $method): void {
    if ($method !== 'POST' && $action !== 'reports') fail('Method not allowed.', 405);
    $user = requireRole($pdo, 'Admin');
    $d = requestData();

    switch ($action) {
        case 'admin_open_position':
            $courseCode = trim($d['courseCode'] ?? '');
            $section = trim($d['section'] ?? '');
            $facultyName = trim($d['faculty'] ?? '');
            $room = trim($d['room'] ?? '');
            $hours = (int)($d['hours'] ?? 3);

            if (!$courseCode || !$section || !$facultyName || !$room) {
                fail('Course, section, faculty, and room are required.');
            }

            $stmt = $pdo->prepare('SELECT course_id FROM courses WHERE course_code = ?');
            $stmt->execute([$courseCode]);
            $courseId = $stmt->fetchColumn();
            if (!$courseId) fail('Invalid course code.');

            $stmt = $pdo->prepare('SELECT user_id FROM users WHERE name = ? AND role = "Faculty"');
            $stmt->execute([$facultyName]);
            $facultyId = $stmt->fetchColumn();
            if (!$facultyId) fail('Faculty not found.');

            // Duplicate position handling: Course + Section must be unique
            $stmt = $pdo->prepare('SELECT position_id FROM ta_positions WHERE course_id = ? AND section_code = ?');
            $stmt->execute([$courseId, $section]);
            if ($stmt->fetch()) {
                fail("A TA position for {$courseCode} Section {$section} already exists.");
            }

            // Parse structured schedule from daysTime (e.g. "Sun, Tue · 09:00 - 10:30")
            $daysTime = trim($d['daysTime'] ?? '');
            $parts = explode(' · ', $daysTime);
            $days = trim($parts[0] ?? 'Sun, Tue');
            $timeRange = trim($parts[1] ?? '09:00 - 10:30');

            $times = explode('-', $timeRange);
            $startTime = date('H:i:s', strtotime(trim($times[0] ?? '09:00')));
            $endTime = date('H:i:s', strtotime(trim($times[1] ?? '10:30')));

            // Create TA position without modifying central course_criteria
            $stmt = $pdo->prepare('INSERT INTO ta_positions (course_id, section_code, faculty_user_id, days, start_time, end_time, room, weekly_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "Open")');
            $stmt->execute([$courseId, $section, $facultyId, $days, $startTime, $endTime, $room, $hours]);
            
            ok([], 'TA position opened successfully.');
            break;

        case 'admin_shortlist':
            $choiceId = (int)($d['choiceId'] ?? 0);
            $pdo->prepare('UPDATE application_choices SET workflow_status = "Shortlisted" WHERE application_choice_id = ?')->execute([$choiceId]);
            
            // Notify student
            $stmt = $pdo->prepare('SELECT a.student_user_id, c.course_code FROM application_choices ac JOIN applications a ON ac.application_id = a.application_id JOIN ta_positions p ON ac.position_id = p.position_id JOIN courses c ON p.course_id = c.course_id WHERE ac.application_choice_id = ?');
            $stmt->execute([$choiceId]);
            $info = $stmt->fetch();
            if ($info) {
                makeNotification($pdo, (int)$info['student_user_id'], 'Application Shortlisted', "Your application for {$info['course_code']} has been shortlisted! Wait for interview scheduling.", 'Application');
            }
            
            ok([], 'Application shortlisted.');
            break;   

        case 'admin_close_position':
            $positionId = (int)($d['positionId'] ?? $d['id'] ?? 0);
            if ($positionId === 0) fail('Error: Position ID not received.');
            
            $stmt = $pdo->prepare('UPDATE ta_positions SET status = "Closed" WHERE position_id = ?');
            $stmt->execute([$positionId]);
            
            ok([], 'TA position closed successfully.');
            break;    

        case 'admin_reject':
            $choiceId = (int)($d['choiceId'] ?? 0);
            // Must store as Rejected (distinct from Faculty interview failure Failed)
            $pdo->prepare('UPDATE application_choices SET workflow_status = "Rejected" WHERE application_choice_id = ?')->execute([$choiceId]);
            
            // Notify student
            $stmt = $pdo->prepare('SELECT a.student_user_id, c.course_code FROM application_choices ac JOIN applications a ON ac.application_id = a.application_id JOIN ta_positions p ON ac.position_id = p.position_id JOIN courses c ON p.course_id = c.course_id WHERE ac.application_choice_id = ?');
            $stmt->execute([$choiceId]);
            $info = $stmt->fetch();
            if ($info) {
                makeNotification($pdo, (int)$info['student_user_id'], 'Application Update', "Your application for {$info['course_code']} was not selected by Admin.", 'Application');
            }

            ok([], 'Application rejected.');
            break;

        case 'admin_update_criterion':
            $stmt = $pdo->prepare('UPDATE course_criteria cc JOIN courses c ON cc.course_id = c.course_id SET cc.preferred_grade = ?, cc.prerequisite_code = ? WHERE c.course_code = ?');
            $stmt->execute([$d['preferredGrade'] ?? 'A', $d['prerequisite'] ?? 'None', $d['code'] ?? '']);
            
            ok([], 'Course criteria updated.');
            break;

        case 'admin_save_rules':
            $minCgpa = (float)($d['minCgpa'] ?? 3.50);
            $minCredits = (int)($d['minCredits'] ?? 60);
            $prereqReq = !empty($d['prerequisiteRequired']) ? 1 : 0;
            $maxAssignments = (int)($d['maxAssignments'] ?? 2);
            $deadline = trim($d['deadline'] ?? '2026-12-31');

            if ($minCgpa < 0 || $minCgpa > 4.0) fail('Invalid minimum CGPA.');
            if ($minCredits < 0) fail('Invalid minimum credits.');
            if ($maxAssignments < 1) fail('Maximum TA assignments must be at least 1.');
            if (!$deadline) fail('Application deadline is required.');

            $stmt = $pdo->prepare('
                INSERT INTO recruitment_rules (id, cycle_name, min_cgpa, min_credits, prerequisite_required, max_ta_assignments, application_deadline, updated_by)
                VALUES (1, "Fall 2026", ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    min_cgpa = VALUES(min_cgpa),
                    min_credits = VALUES(min_credits),
                    prerequisite_required = VALUES(prerequisite_required),
                    max_ta_assignments = VALUES(max_ta_assignments),
                    application_deadline = VALUES(application_deadline),
                    updated_by = VALUES(updated_by)
            ');
            $stmt->execute([$minCgpa, $minCredits, $prereqReq, $maxAssignments, $deadline, (int)$user['user_id']]);

            ok([], 'Recruitment rules saved globally.');
            break;

        case 'reports':
            $type = $d['type'] ?? 'Application Summary';
            $columns = [];
            $rows = [];

            if ($type === 'Application Summary') {
                $columns = ['Student Name', 'Course', 'CGPA', 'Status'];
                $rows = $pdo->query("SELECT student_name, course_code, cgpa, choice_status FROM view_application_details ORDER BY course_code")->fetchAll(PDO::FETCH_NUM);
            } 
            elseif ($type === 'TA Assignment Sheet') {
                $columns = ['TA Name', 'Course', 'Section', 'Faculty'];
                $rows = $pdo->query("SELECT student_name, course_code, section_code, faculty_name FROM view_application_details WHERE choice_status = 'Assigned' ORDER BY course_code")->fetchAll(PDO::FETCH_NUM);
            } 
            elseif ($type === 'Interview Scores') {
                $columns = ['Candidate', 'Course', 'Score', 'Decision'];
                $rows = $pdo->query("
                    SELECT v.student_name, v.course_code, 
                           COALESCE(CONCAT(e.total_score, '/20'), 'Not Evaluated'), 
                           COALESCE(e.decision, 'Pending') 
                    FROM view_application_details v 
                    JOIN interviews i ON v.application_choice_id = i.application_choice_id 
                    LEFT JOIN interview_evaluations e ON i.interview_id = e.interview_id
                ")->fetchAll(PDO::FETCH_NUM);
            } 
            elseif ($type === 'Semester Evaluation') {
                $columns = ['TA Name', 'Course', 'Rating', 'Feedback'];
                $rows = $pdo->query("
                    SELECT u.name, c.course_code, CONCAT(e.rating, '/5'), e.feedback 
                    FROM ta_performance_evaluations e 
                    JOIN ta_assignments a ON e.assignment_id = a.assignment_id 
                    JOIN users u ON a.student_user_id = u.user_id 
                    JOIN ta_positions p ON a.position_id = p.position_id 
                    JOIN courses c ON p.course_id = c.course_id
                ")->fetchAll(PDO::FETCH_NUM);
            } 
            elseif ($type === 'Reported TAs') {
                $columns = ['TA Name', 'Course', 'Issue Category', 'Incident Details'];
                $rows = $pdo->query("
                    SELECT u.name, c.course_code, 'Faculty Report', e.incident_report 
                    FROM ta_performance_evaluations e 
                    JOIN ta_assignments a ON e.assignment_id = a.assignment_id 
                    JOIN users u ON a.student_user_id = u.user_id 
                    JOIN ta_positions p ON a.position_id = p.position_id 
                    JOIN courses c ON p.course_id = c.course_id 
                    WHERE e.incident_report IS NOT NULL AND TRIM(e.incident_report) != ''
                ")->fetchAll(PDO::FETCH_NUM);
            }
            
            ok(['columns' => $columns, 'rows' => $rows], 'Report generated.');
            break;
    }
}
