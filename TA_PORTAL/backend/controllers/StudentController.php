<?php
declare(strict_types=1);

/**
 * Checks whether two positions have overlapping schedules.
 * Overlap condition: at least one common day AND start1 < end2 AND start2 < end1 (half-open interval).
 */
function hasScheduleConflict(array $pos1, array $pos2): bool {
    if (empty($pos1['days']) || empty($pos2['days']) || empty($pos1['start_time']) || empty($pos2['start_time'])) {
        return false;
    }

    // Normalize days into sets
    $normalizeDays = function(string $daysStr): array {
        $parts = preg_split('/[,\|\/]+/', str_replace(' ', '', strtolower($daysStr)));
        return array_filter($parts ?: []);
    };

    $days1 = $normalizeDays($pos1['days']);
    $days2 = $normalizeDays($pos2['days']);

    // Check day overlap
    $sharedDays = array_intersect($days1, $days2);
    if (empty($sharedDays)) {
        return false;
    }

    // Half-open interval time overlap check: start1 < end2 AND start2 < end1
    $s1 = strtotime($pos1['start_time']);
    $e1 = strtotime($pos1['end_time']);
    $s2 = strtotime($pos2['start_time']);
    $e2 = strtotime($pos2['end_time']);

    return ($s1 < $e2 && $s2 < $e1);
}

function handleStudent(PDO $pdo, string $action, string $method): void {
    if ($method !== 'POST') fail('Method not allowed.', 405);
    $user = requireRole($pdo, 'Student');
    $userId = (int)$user['user_id'];

    if ($action === 'submit_application') {
        $choicesJson = $_POST['choices'] ?? '[]';
        $choices = json_decode($choicesJson, true) ?? [];
        if (empty($choices) || !is_array($choices)) {
            fail('You must select at least one TA position.');
        }

        // 1. Fetch Authoritative Recruitment Rules
        $rulesRow = $pdo->query('SELECT * FROM recruitment_rules LIMIT 1')->fetch();
        $minCgpa = (float)($rulesRow['min_cgpa'] ?? 3.50);
        $minCredits = (int)($rulesRow['min_credits'] ?? 60);
        $prereqReq = !empty($rulesRow['prerequisite_required']);
        $maxChoices = (int)($rulesRow['max_application_choices'] ?? 3);
        $deadline = $rulesRow['application_deadline'] ?? '2026-12-31';

        // 2. Authoritative Application Deadline Enforcement
        if (date('Y-m-d') > $deadline) {
            fail("The application deadline ({$deadline}) has passed. Submissions are closed.");
        }

        // 3. Choice Count and Uniqueness Validation
        if (count($choices) > $maxChoices) {
            fail("You can select up to {$maxChoices} positions.");
        }
        $choices = array_map('intval', $choices);
        if (count($choices) !== count(array_unique($choices))) {
            fail('Duplicate positions selected in application.');
        }

        // 4. Check for Existing Application & Capacity (FIXED)
        $appCheck = $pdo->prepare('SELECT application_id FROM applications WHERE student_user_id = ? AND cycle_id = "Fall 2026"');
        $appCheck->execute([$userId]);
        $existingApp = $appCheck->fetch();
        
        $appId = $existingApp ? (int)$existingApp['application_id'] : null;
        
        if ($appId) {
            $choiceCountStmt = $pdo->prepare('SELECT COUNT(*) FROM application_choices WHERE application_id = ?');
            $choiceCountStmt->execute([$appId]);
            $existingCount = (int)$choiceCountStmt->fetchColumn();
            
            if ($existingCount + count($choices) > $maxChoices) {
                fail("You already have {$existingCount} choices submitted. You can only add " . ($maxChoices - $existingCount) . " more.");
            }

            // Ensure we aren't re-submitting the exact same choice
            $existingChoicesStmt = $pdo->prepare('SELECT position_id FROM application_choices WHERE application_id = ?');
            $existingChoicesStmt->execute([$appId]);
            $existingPosIds = $existingChoicesStmt->fetchAll(PDO::FETCH_COLUMN);
            foreach ($choices as $posId) {
                if (in_array($posId, $existingPosIds)) {
                    fail("You have already applied for position #{$posId}.");
                }
            }
        }

        // 5. Hard Eligibility Validation: CGPA & Credits
        $profStmt = $pdo->prepare('SELECT cgpa, completed_credits FROM student_profiles WHERE user_id = ?');
        $profStmt->execute([$userId]);
        $profile = $profStmt->fetch();
        if (!$profile) {
            fail('Student profile not found. Please contact administration.');
        }

        $studentCgpa = (float)$profile['cgpa'];
        $studentCredits = (int)$profile['completed_credits'];

        if ($studentCgpa < $minCgpa) {
            fail("Your CGPA ({$studentCgpa}) is below the required minimum of {$minCgpa}.");
        }
        if ($studentCredits < $minCredits) {
            fail("Your completed credits ({$studentCredits}) are below the required minimum of {$minCredits}.");
        }

        // 6. Fetch Selected Position Details & Validate Prerequisites
        $selectedPositions = [];
        foreach ($choices as $posId) {
            $stmt = $pdo->prepare('
                SELECT p.position_id, p.section_code, p.days, p.start_time, p.end_time, 
                       c.course_id, c.course_code, c.course_name, crit.prerequisite_code, crit.preferred_grade
                FROM ta_positions p
                JOIN courses c ON p.course_id = c.course_id
                LEFT JOIN course_criteria crit ON c.course_id = crit.course_id
                WHERE p.position_id = ? AND p.status = "Open"
            ');
            $stmt->execute([$posId]);
            $pos = $stmt->fetch();
            if (!$pos) {
                fail("Selected position #{$posId} is invalid or no longer open.");
            }

            // Prerequisite check (Hard criterion)
            $prereq = trim($pos['prerequisite_code'] ?? 'None');
            if ($prereqReq && $prereq !== '' && $prereq !== 'None') {
                $checkPrereq = $pdo->prepare('
                    SELECT grade FROM student_academic_records 
                    WHERE student_user_id = ? AND course_code = ? AND completed_flag = 1 AND grade != "F"
                ');
                $checkPrereq->execute([$userId, $prereq]);
                if (!$checkPrereq->fetch()) {
                    fail("Prerequisite requirement not met: You must complete {$prereq} before applying for {$pos['course_code']}.");
                }
            }

            $selectedPositions[] = $pos;
        }

        // 7. Schedule Conflict Validation Among Selected Choices
        $posCount = count($selectedPositions);
        for ($i = 0; $i < $posCount; $i++) {
            for ($j = $i + 1; $j < $posCount; $j++) {
                if (hasScheduleConflict($selectedPositions[$i], $selectedPositions[$j])) {
                    $c1 = "{$selectedPositions[$i]['course_code']} Sec {$selectedPositions[$i]['section_code']}";
                    $c2 = "{$selectedPositions[$j]['course_code']} Sec {$selectedPositions[$j]['section_code']}";
                    fail("Time conflict detected between selected choices: {$c1} and {$c2}.");
                }
            }
        }

        // 8. Schedule Conflict Validation Against Student's Existing Assigned TA Schedules
        $asgStmt = $pdo->prepare('
            SELECT p.position_id, p.section_code, p.days, p.start_time, p.end_time, c.course_code
            FROM ta_assignments a
            JOIN ta_positions p ON a.position_id = p.position_id
            JOIN courses c ON p.course_id = c.course_id
            WHERE a.student_user_id = ?
        ');
        $asgStmt->execute([$userId]);
        $existingAssignments = $asgStmt->fetchAll();

        foreach ($selectedPositions as $newPos) {
            foreach ($existingAssignments as $exPos) {
                if (hasScheduleConflict($newPos, $exPos)) {
                    $cNew = "{$newPos['course_code']} Sec {$newPos['section_code']}";
                    $cEx = "{$exPos['course_code']} Sec {$exPos['section_code']}";
                    fail("Time conflict: {$cNew} conflicts with your assigned TA schedule for {$cEx}.");
                }
            }
        }

        // 8b. Add check against already applied positions in the current application to prevent conflicts with pending choices
        if ($appId) {
            $pendingStmt = $pdo->prepare('
                SELECT p.position_id, p.section_code, p.days, p.start_time, p.end_time, c.course_code
                FROM application_choices ac
                JOIN ta_positions p ON ac.position_id = p.position_id
                JOIN courses c ON p.course_id = c.course_id
                WHERE ac.application_id = ? AND ac.workflow_status NOT IN ("Rejected", "Failed")
            ');
            $pendingStmt->execute([$appId]);
            $pendingAssignments = $pendingStmt->fetchAll();

            foreach ($selectedPositions as $newPos) {
                foreach ($pendingAssignments as $exPos) {
                    if (hasScheduleConflict($newPos, $exPos)) {
                        $cNew = "{$newPos['course_code']} Sec {$newPos['section_code']}";
                        $cEx = "{$exPos['course_code']} Sec {$exPos['section_code']}";
                        fail("Time conflict: {$cNew} conflicts with your previously applied schedule for {$cEx}.");
                    }
                }
            }
        }

        // 9. Input and File Validation
        $statement = trim($_POST['statement'] ?? '');
        $portfolio = trim($_POST['portfolio'] ?? '');

        if ($statement !== '') {
            $wordCount = count(preg_split('/\s+/', $statement));
            if ($wordCount > 300) {
                fail('Statement of interest must be 300 words or fewer.');
            }
        }

        $uploadDir = __DIR__ . '/../../uploads/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $handleUpload = function(string $fileKey, string $prefix) use ($uploadDir): ?string {
            if (!isset($_FILES[$fileKey]) || $_FILES[$fileKey]['error'] === UPLOAD_ERR_NO_FILE) {
                return null;
            }
            if ($_FILES[$fileKey]['error'] !== UPLOAD_ERR_OK) {
                fail("File upload error for {$fileKey}.");
            }
            if ($_FILES[$fileKey]['size'] > 5 * 1024 * 1024) {
                fail("Uploaded {$fileKey} file must be 5MB or smaller.");
            }
            $ext = strtolower(pathinfo($_FILES[$fileKey]['name'], PATHINFO_EXTENSION));
            if ($ext !== 'pdf') {
                fail("Uploaded {$fileKey} must be a valid PDF document.");
            }
            $safeName = $prefix . '_' . time() . '_' . mt_rand(1000, 9999) . '.pdf';
            if (move_uploaded_file($_FILES[$fileKey]['tmp_name'], $uploadDir . $safeName)) {
                return '../uploads/' . $safeName;
            }
            return null;
        };

        $cvPath = $handleUpload('cv', 'cv');
        $transcriptPath = $handleUpload('transcript', 'transcript');

        // 10. Atomic Database Insert / Update (FIXED)
        $pdo->beginTransaction();
        try {
            if (!$appId) {
                // Create brand new application
                $stmt = $pdo->prepare('
                    INSERT INTO applications (student_user_id, cycle_id, statement_of_interest, cv_file_path, transcript_file_path, portfolio_link, overall_status) 
                    VALUES (?, "Fall 2026", ?, ?, ?, ?, "Under Review")
                ');
                $stmt->execute([$userId, $statement, $cvPath, $transcriptPath, $portfolio]);
                $appId = (int)$pdo->lastInsertId();
                $currentRank = 1;
            } else {
                // Determine the next available preference rank for existing app
                $rankStmt = $pdo->prepare('SELECT COALESCE(MAX(preference_rank), 0) FROM application_choices WHERE application_id = ?');
                $rankStmt->execute([$appId]);
                $currentRank = (int)$rankStmt->fetchColumn() + 1;
                
                // Update files and statement if provided
                $updateParts = [];
                $updateParams = [];
                if ($statement !== '') { $updateParts[] = "statement_of_interest = ?"; $updateParams[] = $statement; }
                if ($cvPath !== null) { $updateParts[] = "cv_file_path = ?"; $updateParams[] = $cvPath; }
                if ($transcriptPath !== null) { $updateParts[] = "transcript_file_path = ?"; $updateParams[] = $transcriptPath; }
                if ($portfolio !== '') { $updateParts[] = "portfolio_link = ?"; $updateParams[] = $portfolio; }
                
                if (!empty($updateParts)) {
                    $updateParams[] = $appId;
                    $updateAppStmt = $pdo->prepare('UPDATE applications SET ' . implode(', ', $updateParts) . ' WHERE application_id = ?');
                    $updateAppStmt->execute($updateParams);
                }
            }

            $choiceStmt = $pdo->prepare('
                INSERT INTO application_choices (application_id, position_id, preference_rank, workflow_status) 
                VALUES (?, ?, ?, "Under Review")
            ');
            
            foreach ($choices as $positionId) {
                $choiceStmt->execute([$appId, $positionId, $currentRank]);
                $currentRank++;
            }

            $pdo->commit();
            makeNotification($pdo, $userId, 'Application Updated', 'Your TA application choices have been submitted successfully.', 'Application');
            ok([], 'Application submitted successfully.');
        } catch (Exception $e) {
            $pdo->rollBack();
            fail('Database error saving application: ' . $e->getMessage());
        }
    }

    if ($action === 'mark_notification_read') {
        $d = requestData();
        $notifId = (int)($d['id'] ?? 0);
        $stmt = $pdo->prepare('UPDATE notifications SET is_unread = FALSE WHERE notification_id = ? AND user_id = ?');
        $stmt->execute([$notifId, $userId]);
        ok([], 'Notification marked as read.');
    }
}