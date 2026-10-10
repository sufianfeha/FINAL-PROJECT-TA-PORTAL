<?php
declare(strict_types=1);

// 1. Set headers
header('Content-Type: application/json; charset=utf-8');

// 2. Load configuration and database (this applies the ini_set rules)
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';

// 3. Start the session AFTER the config is loaded
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$action = $_GET['action'] ?? null;
$method = $_SERVER['REQUEST_METHOD'];

if (!$action) {
    fail('No API action specified.', 400);
}

try {
    switch ($action) {
        // --- AUTHENTICATION ---
        case 'login':
        case 'logout':
        case 'change_password':
        case 'signup':
            require_once __DIR__ . '/controllers/AuthController.php';
            handleAuth($pdo, $action, $method);
            break;

        // --- GLOBAL BOOTSTRAP (State Loading) ---
        case 'bootstrap':
            require_once __DIR__ . '/controllers/BootstrapController.php';
            handleBootstrap($pdo, $method);
            break;

        // --- ADMIN ROUTES ---
        case 'admin_open_position':
        case 'admin_close_position':
        case 'admin_shortlist':
        case 'admin_reject':
        case 'admin_update_criterion':
        case 'admin_save_rules':
        case 'reports':
            require_once __DIR__ . '/controllers/AdminController.php';
            handleAdmin($pdo, $action, $method);
            break;

        // --- FACULTY ROUTES ---
        case 'schedule_interview':
        case 'save_interview_evaluation':
        case 'assign_ta':
        case 'save_ta_evaluation':
        case 'report_ta_issue':
        case 'send_certificate':
        case 'generate_certificate':
            require_once __DIR__ . '/controllers/FacultyController.php';
            handleFaculty($pdo, $action, $method);
            break;

        // --- STUDENT ROUTES ---
        case 'submit_application':
        case 'mark_notification_read':
            require_once __DIR__ . '/controllers/StudentController.php';
            handleStudent($pdo, $action, $method);
            break;

        default:
            fail('Unknown API endpoint: ' . $action, 404);
    }
} catch (Throwable $e) {
    fail('Server error: ' . $e->getMessage(), 500);
}
