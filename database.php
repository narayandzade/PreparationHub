<?php
$host = 'localhost';
$db   = 'preparation';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    die(json_encode(['success' => false, 'message' => $e->getMessage()]));
}

// Auto-backup: runs on every request, overwrites a single backup file.
// Silent — never interrupts normal operation even if backup fails.
require_once __DIR__ . '/backup.php';