<?php
declare(strict_types=1);

function handleBootstrap(PDO $pdo, string $method): void {
    if ($method !== 'GET') fail('Method not allowed.', 405);

    if (empty($_SESSION['user_id']) || empty($_SESSION['role'])) {
        fail('Authentication required.', 401);
    }

    $userId = (int)$_SESSION['user_id'];
    $role   = $_SESSION['role'];

    // 1. Current User
    $stmt = $pdo->prepare('SELECT name, role FROM users WHERE user_id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) {
        fail('User not found.', 404);
    }

    // 2. Common Data: Courses & Notifications
    $courses = $pdo->query('SELECT course_id AS id, course_code AS code, course_name AS name, department FROM courses')->fetchAll();

    $notifStmt = $pdo->prepare(
        'SELECT notification_id AS id, title, message AS text,
                DATE_FORMAT(created_at, "%d %b %Y") AS date, is_unread AS unread
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC'
    );
    $notifStmt->execute([$userId]);
    $notifications = $notifStmt->fetchAll();
    foreach ($notifications as &$n) {
        $n['unread'] = (bool)$n['unread'];
    }
    unset($n);

    // 3. Dynamic Rules from Database
    $rulesRow = $pdo->query('SELECT * FROM recruitment_rules ORDER BY id DESC LIMIT 1')->fetch();
    $rules = [
        'maxApplicationChoices' => (int)($rulesRow['max_application_choices'] ?? 3),
        'minCgpa'               => (float)($rulesRow['min_cgpa'] ?? 3.50),
        'minCredits'            => (int)($rulesRow['min_credits'] ?? 60),
        'prerequisiteRequired'  => (bool)($rulesRow['prerequisite_required'] ?? true),
        'maxTaAssignments'      => (int)($rulesRow['max_ta_assignments'] ?? 2),
        'applicationDeadline'   => $rulesRow['application_deadline'] ?? '2026-12-31',
    ];

    // 4. Faculty list
    $facultyList = $pdo->query('SELECT name FROM users WHERE role = "Faculty"')->fetchAll(PDO::FETCH_ASSOC);

    // 5. Base Response
    $response = [
        'systemName'    => 'TA Recruitment & Management System',
        'term'          => 'Fall 2026',
        'currentUser'   => ['name' => $user['name'], 'role' => $user['role']],
        'courses'       => $courses,
        'notifications' => $notifications,
        'grades'        => ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'],
        'facultyList'   => $facultyList,
        'admin'         => ['rules' => $rules],
    ];

    // 6. Role-Specific Logic
    if ($role === 'Student') {
        $profStmt = $pdo->prepare('SELECT * FROM student_profiles WHERE user_id = ?');
        $profStmt->execute([$userId]);
        $profile = $profStmt->fetch();

        $dept = $profile['department'] ?? '';

        // Open positions for student's department
        $openStmt = $pdo->prepare("
            SELECT position_id AS id, course_code AS code, course_name AS name,
                   section_code AS section, faculty_name AS faculty,
                   CONCAT(days, ' · ', DATE_FORMAT(start_time, '%H:%i'), ' - ', DATE_FORMAT(end_time, '%H:%i')) AS daysTime,
                   room, weekly_hours AS hours, status, course_department AS department,
                   preferred_grade AS preferredGrade, prerequisite_code AS prerequisite,
                   days, DATE_FORMAT(start_time, '%H:%i') AS startTime, DATE_FORMAT(end_time, '%H:%i') AS endTime
            FROM view_available_positions 
            WHERE status = 'Open' AND course_department = ?
        ");
        $openStmt->execute([$dept]);
        $response['open_positions'] = $openStmt->fetchAll();

        // All positions in department (for conflict and status checks)
        $allPosStmt = $pdo->prepare("
            SELECT position_id AS id, course_code AS code, course_name AS name,
                   section_code AS section, faculty_name AS faculty,
                   CONCAT(days, ' · ', DATE_FORMAT(start_time, '%H:%i'), ' - ', DATE_FORMAT(end_time, '%H:%i')) AS daysTime,
                   room, weekly_hours AS hours, status, course_department AS department,
                   preferred_grade AS preferredGrade, prerequisite_code AS prerequisite,
                   days, DATE_FORMAT(start_time, '%H:%i') AS startTime, DATE_FORMAT(end_time, '%H:%i') AS endTime
            FROM view_available_positions
            WHERE course_department = ?
        ");
        $allPosStmt->execute([$dept]);
        $response['positions'] = $allPosStmt->fetchAll();

        // Student applications
        $appStmt = $pdo->prepare("
            SELECT p.position_id AS positionId, c.course_code, ac.workflow_status AS status,
                   DATE_FORMAT(a.submitted_at, '%d %b %Y') AS submitted
            FROM application_choices ac
            JOIN applications a  ON ac.application_id = a.application_id
            JOIN ta_positions p  ON ac.position_id    = p.position_id
            JOIN courses c       ON p.course_id       = c.course_id
            WHERE a.student_user_id = ?
        ");
        $appStmt->execute([$userId]);
        $apps = $appStmt->fetchAll();

        // Student's completed course grades from academic records
        $gradeStmt = $pdo->prepare('SELECT course_code, grade FROM student_academic_records WHERE student_user_id = ?');
        $gradeStmt->execute([$userId]);
        $courseGrades = [];
        foreach ($gradeStmt->fetchAll() as $gr) {
            $courseGrades[$gr['course_code']] = $gr['grade'];
        }

        $cgpa = (float)($profile['cgpa'] ?? 0);
        $credits = (int)($profile['completed_credits'] ?? 0);

        $response['student'] = [
            'name'            => $user['name'],
            'id'              => $profile['student_id_number'] ?? '',
            'department'      => $dept,
            'cgpa'            => $cgpa,
            'credits'         => $credits,
            'generalEligible' => ($cgpa >= $rules['minCgpa'] && $credits >= $rules['minCredits']),
            'courseGrades'    => $courseGrades,
            'applications'    => $apps,
            'assigned'        => array_values(array_filter($apps, fn($a) => $a['status'] === 'Assigned')),
        ];

    } elseif ($role === 'Faculty') {
        $facStmt = $pdo->prepare('SELECT * FROM view_application_details WHERE faculty_user_id = ?');
        $facStmt->execute([$userId]);
        $allCandidates = $facStmt->fetchAll();

        $mapCandidate = function($row) {
            $docs = [];
            if (!empty($row['cv_file_path']))         $docs[] = ['name' => 'CV / Resume',    'type' => 'PDF',      'size' => 'File', 'url' => $row['cv_file_path']];
            if (!empty($row['transcript_file_path'])) $docs[] = ['name' => 'Transcript',     'type' => 'PDF',      'size' => 'File', 'url' => $row['transcript_file_path']];
            if (!empty($row['portfolio_link']))        $docs[] = ['name' => 'Portfolio Link', 'type' => 'External', 'size' => 'Link', 'url' => $row['portfolio_link']];

            return [
                'id'         => (int)$row['application_choice_id'],
                'name'       => $row['student_name'],
                'email'      => $row['student_email'],
                'cgpa'       => (float)$row['cgpa'],
                'credits'    => (int)$row['completed_credits'],
                'positionId' => (int)$row['position_id'],
                'status'     => $row['choice_status'],
                'statement'  => $row['statement_of_interest'],
                'documents'  => $docs,
            ];
        };

        $shortlisted = [];
        $interviewed = [];
        $passed      = [];
        $activeTAs   = [];

        foreach ($allCandidates as $row) {
            // Do not show Rejected candidates in faculty queues
            if ($row['choice_status'] === 'Rejected') continue;

            $c = $mapCandidate($row);

            if ($row['choice_status'] === 'Shortlisted') {
                $shortlisted[] = $c;
            } elseif (in_array($row['choice_status'], ['Interview', 'Passed', 'Failed', 'Assigned'])) {
                // Fetch interview and evaluation data safely with LEFT JOIN
                $intStmt = $pdo->prepare('
                    SELECT i.scheduled_at, ie.decision, ie.total_score
                    FROM interviews i
                    LEFT JOIN interview_evaluations ie ON i.interview_id = ie.interview_id
                    WHERE i.application_choice_id = ?
                    ORDER BY i.interview_id DESC LIMIT 1
                ');
                $intStmt->execute([$row['application_choice_id']]);
                $interview = $intStmt->fetch();

                $c['interviewDate']  = ($interview && !empty($interview['scheduled_at']))
                    ? date('d M Y, h:i A', strtotime($interview['scheduled_at']))
                    : null;
                $c['evaluation']     = ($interview && !empty($interview['decision'])) ? $interview['decision'] : 'Not Evaluated';
                $c['interviewScore'] = ($interview && $interview['total_score'] !== null) ? (int)$interview['total_score'] : null;

                if ($row['choice_status'] === 'Interview') {
                    $c['status'] = 'Not Evaluated';
                }

                $interviewed[] = $c;

                if ($row['choice_status'] === 'Passed') {
                    $passed[] = $c;
                }

                if ($row['choice_status'] === 'Assigned') {
                    $asnStmt = $pdo->prepare('SELECT assignment_id, assigned_hours FROM ta_assignments WHERE application_choice_id = ? LIMIT 1');
                    $asnStmt->execute([$row['application_choice_id']]);
                    $asn = $asnStmt->fetch();

                    $c['hours']        = $asn ? (int)$asn['assigned_hours'] : 3;
                    $c['assignmentId'] = $asn ? (int)$asn['assignment_id'] : null;
                    $activeTAs[]       = $c;
                }
            }
        }

        $response['faculty'] = [
            'shortlisted'      => $shortlisted,
            'interviewed'      => $interviewed,
            'passed'           => $passed,
            'activeTAs'        => $activeTAs,
            'tasForEvaluation' => $activeTAs,
        ];

        $response['positions'] = $pdo->query('
            SELECT p.position_id AS id, c.course_code AS code, p.section_code AS section
            FROM ta_positions p
            JOIN courses c ON p.course_id = c.course_id
        ')->fetchAll();

    } elseif ($role === 'Admin') {
        $response['positions'] = $pdo->query("
            SELECT position_id AS id, course_code AS code, course_name AS name,
                   section_code AS section, faculty_name AS faculty,
                   CONCAT(days, ' · ', DATE_FORMAT(start_time, '%H:%i'), ' - ', DATE_FORMAT(end_time, '%H:%i')) AS daysTime,
                   room, weekly_hours AS hours, status, course_department AS department
            FROM view_available_positions
        ")->fetchAll();

        // Load all application details
        $allApps = $pdo->query('SELECT * FROM view_application_details')->fetchAll();

        // Load grades lookup for students
        $allGrades = $pdo->query('SELECT student_user_id, course_code, grade FROM student_academic_records')->fetchAll();
        $gradesByUserCourse = [];
        foreach ($allGrades as $g) {
            $gradesByUserCourse[$g['student_user_id'] . '_' . $g['course_code']] = $g['grade'];
        }

        $mappedApps = array_map(function($row) use ($gradesByUserCourse) {
            $docs = [];
            if (!empty($row['cv_file_path']))         $docs[] = ['name' => 'CV / Resume',    'type' => 'PDF',      'size' => 'File', 'url' => $row['cv_file_path']];
            if (!empty($row['transcript_file_path'])) $docs[] = ['name' => 'Transcript',     'type' => 'PDF',      'size' => 'File', 'url' => $row['transcript_file_path']];
            if (!empty($row['portfolio_link']))        $docs[] = ['name' => 'Portfolio Link', 'type' => 'External', 'size' => 'Link', 'url' => $row['portfolio_link']];

            $gradeKey = $row['student_user_id'] . '_' . $row['course_code'];
            $courseGrade = $gradesByUserCourse[$gradeKey] ?? 'N/A';

            return [
                'id'          => (int)$row['application_choice_id'],
                'name'        => $row['student_name'],
                'email'       => $row['student_email'],
                'studentId'   => $row['student_id_number'],
                'department'  => $row['student_department'],
                'cgpa'        => (float)$row['cgpa'],
                'credits'     => (int)$row['completed_credits'],
                'positionId'  => (int)$row['position_id'],
                'status'      => $row['choice_status'],
                'appliedOn'   => date('d M Y', strtotime($row['submitted_at'])),
                'courseGrade' => $courseGrade,
                'statement'   => $row['statement_of_interest'],
                'documents'   => $docs,
            ];
        }, $allApps);

        $criteria = $pdo->query('
            SELECT c.course_code AS code, cc.preferred_grade AS preferredGrade, cc.prerequisite_code AS prerequisite
            FROM course_criteria cc
            JOIN courses c ON cc.course_id = c.course_id
        ')->fetchAll();

        // Also include faculty's active TAs count for dashboard stat
        $activeTaRows = $pdo->query('
            SELECT a.assignment_id, u.name, c.course_code, p.section_code, a.assigned_hours AS weekly_hours
            FROM ta_assignments a
            JOIN users u ON a.student_user_id = u.user_id
            JOIN ta_positions p ON a.position_id = p.position_id
            JOIN courses c ON p.course_id = c.course_id
        ')->fetchAll();

        $response['admin'] = [
            'rules'           => $rules,
            'subjectCriteria' => $criteria,
            'applications'    => $mappedApps,
        ];
        $response['faculty'] = [
            'activeTAs' => $activeTaRows,
        ];
    }

    ok($response);
}
