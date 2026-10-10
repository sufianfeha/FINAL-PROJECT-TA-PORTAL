<?php
declare(strict_types=1);

function handleAuth(PDO $pdo, string $action, string $method): void {
    if ($method !== 'POST') fail('Method not allowed.', 405);

    if ($action === 'login') {
        $data = requestData();
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if (!$email || !$password) {
            fail('Email and password are required.');
        }

        $stmt = $pdo->prepare('SELECT user_id, name, role, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        $isValidPassword = $user && password_verify($password, $user['password_hash']);

        if (!$isValidPassword) {
            fail('Invalid email or password.', 401);
        }

        // Set session variables securely
        $_SESSION['user_id'] = (int)$user['user_id'];
        $_SESSION['role'] = $user['role'];

        $redirects = [
            'Student' => '../Student/s_dashboard.html',
            'Faculty' => '../Faculty/index.html',
            'Admin'   => '../Admin/index.html'
        ];

        ok(['redirect' => $redirects[$user['role']]], 'Authentication successful.');
    }

    if ($action === 'logout') {
        session_unset();
        session_destroy();
        ok(null, 'Logged out successfully.');
    }

    if ($action === 'change_password') {
        if (empty($_SESSION['user_id'])) {
            fail('Authentication required.', 401);
        }

        $data = requestData();
        $currentPassword = $data['current_password'] ?? '';
        $newPassword = $data['new_password'] ?? '';

        if (empty($currentPassword) || empty($newPassword)) {
            fail('Both current and new passwords are required.', 400);
        }

        $userId = (int)$_SESSION['user_id'];

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE user_id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
            fail('Incorrect current password.', 400);
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $updateStmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE user_id = ?');
        $updateStmt->execute([$newHash, $userId]);

        ok(['message' => 'Password updated successfully.']);
    }

    if ($action === 'signup') {
        $data = requestData();
        $name = trim($data['name'] ?? '');
        $studentId = trim($data['student_id'] ?? '');
        $department = trim($data['department'] ?? '');
        $email = trim($data['email'] ?? '');
        $cgpa = (float)($data['cgpa'] ?? 0.0);
        $credits = (int)($data['credits'] ?? 0);
        $password = $data['password'] ?? '';

        if (!$name || !$studentId || !$department || !$email || !$password) {
            fail('All fields are required.');
        }

        $validDepts = ['BBA', 'CSE', 'EEE', 'Civil'];
        if (!in_array($department, $validDepts, true)) {
            fail('Invalid department selected.');
        }

        if ($cgpa < 0 || $cgpa > 4.0) {
            fail('CGPA must be between 0.00 and 4.00.');
        }

        // Check if email already exists
        $stmt = $pdo->prepare('SELECT user_id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            fail('Email already registered.');
        }

        // Check if student ID already exists
        $stmt = $pdo->prepare('SELECT profile_id FROM student_profiles WHERE student_id_number = ?');
        $stmt->execute([$studentId]);
        if ($stmt->fetch()) {
            fail('Student ID already registered.');
        }

        $pdo->beginTransaction();
        try {
            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            $userStmt = $pdo->prepare(
                'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "Student")'
            );
            $userStmt->execute([$name, $email, $passwordHash]);
            $newUserId = (int)$pdo->lastInsertId();

            $profStmt = $pdo->prepare(
                'INSERT INTO student_profiles (user_id, student_id_number, department, cgpa, completed_credits)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $profStmt->execute([$newUserId, $studentId, $department, $cgpa, $credits]);

            $pdo->commit();
            ok(['redirect' => 'signin.html'], 'Account created successfully! Please log in.');
        } catch (Exception $e) {
            $pdo->rollBack();
            fail('Database error creating account.');
        }
    }
}