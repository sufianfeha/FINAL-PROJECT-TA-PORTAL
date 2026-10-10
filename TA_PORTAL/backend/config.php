<?php
declare(strict_types=1);

// Error reporting for development (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', '1');

// Database configuration
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'ta_portal');
define('DB_USER', 'root');
define('DB_PASS', ''); // Change this if your MySQL has a password