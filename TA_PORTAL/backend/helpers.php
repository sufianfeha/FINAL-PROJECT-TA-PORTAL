<?php
declare(strict_types=1);

function ok(array $data = [], string $message = 'Success'): void {
    echo json_encode(['ok' => true, 'message' => $message, 'data' => $data]);
    exit;
}

function fail(string $message = 'Error', int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'message' => $message]);
    exit;
}

function requestData(): array {
    $json = file_get_contents('php://input');
    return $json ? json_decode($json, true) ?? [] : $_POST;
}

function requireRole(PDO $pdo, string $role): array {
    if (session_status() === PHP_SESSION_NONE) session_start();
    if (empty($_SESSION['user_id'])) fail('Authentication required.', 401);
    
    $stmt = $pdo->prepare('SELECT * FROM users WHERE user_id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user || $user['role'] !== $role) {
        fail('Unauthorized access.', 403);
    }
    return $user;
}

function makeNotification(PDO $pdo, int $userId, string $title, string $message, string $category = 'General'): void {
    $stmt = $pdo->prepare('INSERT INTO notifications (user_id, title, message, category) VALUES (?, ?, ?, ?)');
    $stmt->execute([$userId, $title, $message, $category]);
}