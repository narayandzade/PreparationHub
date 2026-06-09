<?php
/**
 * backup.php — auto-detects mysqldump path, uses PDO fallback if exec() is
 * disabled, writes preparation_backup.sql and backup.log in the same folder.
 */

define('BACKUP_HOST', 'localhost');
define('BACKUP_DB',   'preparation');
define('BACKUP_USER', 'root');
define('BACKUP_PASS', '');
define('BACKUP_FILE', __DIR__ . '/preparation_backup.sql');
define('BACKUP_LOG',  __DIR__ . '/backup.log');

function backupLog(string $msg): void {
    @file_put_contents(BACKUP_LOG, '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n", FILE_APPEND);
}

// ── 1. Find mysqldump binary ─────────────────────────────────────────────────
function findMysqldump(): string {
    // Common XAMPP / Homebrew / system locations (Mac + Windows + Linux)
    $candidates = [
        '/Applications/XAMPP/xamppfiles/bin/mysqldump',   // XAMPP Mac
        '/Applications/MAMP/Library/bin/mysqldump',       // MAMP Mac
        '/usr/local/bin/mysqldump',                        // Homebrew Mac
        '/opt/homebrew/bin/mysqldump',                     // Homebrew Apple Silicon
        '/usr/bin/mysqldump',                              // Linux system
        '/usr/local/mysql/bin/mysqldump',                  // MySQL.com pkg Mac
        'C:/xampp/mysql/bin/mysqldump.exe',                // XAMPP Windows
        'C:/wamp64/bin/mysql/mysql8.0.31/bin/mysqldump.exe',
        'mysqldump',                                       // PATH fallback
    ];

    foreach ($candidates as $path) {
        if (@is_executable($path)) return $path;
    }

    // Try `which` / `where` as last resort
    $which = PHP_OS_FAMILY === 'Windows' ? 'where mysqldump' : 'which mysqldump';
    $found = trim((string) shell_exec($which));
    if ($found && @is_executable($found)) return $found;

    return '';
}

// ── 2. PDO fallback dump (pure PHP — no exec needed) ────────────────────────
function pdoDump(): void {
    try {
        $pdo = new PDO(
            'mysql:host=' . BACKUP_HOST . ';dbname=' . BACKUP_DB . ';charset=utf8mb4',
            BACKUP_USER, BACKUP_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    } catch (Throwable $e) {
        backupLog('PDO fallback connect failed: ' . $e->getMessage());
        return;
    }

    $out  = "-- Interview Prep Hub — PDO backup\n";
    $out .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
    $out .= "SET FOREIGN_KEY_CHECKS=0;\n\n";

    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);

    foreach ($tables as $table) {
        // DROP + CREATE
        $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
        $out .= "DROP TABLE IF EXISTS `$table`;\n";
        $out .= $create[1] . ";\n\n";

        // Row data
        $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) { $out .= "\n"; continue; }

        $cols = '`' . implode('`, `', array_keys($rows[0])) . '`';
        $out .= "INSERT INTO `$table` ($cols) VALUES\n";

        $lines = [];
        foreach ($rows as $row) {
            $vals = array_map(function($v) use ($pdo) {
                if ($v === null) return 'NULL';
                return $pdo->quote((string)$v);
            }, array_values($row));
            $lines[] = '(' . implode(', ', $vals) . ')';
        }
        $out .= implode(",\n", $lines) . ";\n\n";
    }

    $out .= "SET FOREIGN_KEY_CHECKS=1;\n";

    if (file_put_contents(BACKUP_FILE, $out) === false) {
        backupLog('PDO fallback: file_put_contents failed — check folder permissions');
        return;
    }
    backupLog('OK (PDO fallback) — ' . round(filesize(BACKUP_FILE) / 1024, 1) . ' KB');
}

// ── 3. Main backup logic ─────────────────────────────────────────────────────
function runBackup(): void {
    // Check write permission first
    $dir = dirname(BACKUP_FILE);
    if (!is_writable($dir)) {
        backupLog('FAILED: directory not writable — ' . $dir);
        return;
    }

    // Check if exec() is available
    $disabled = array_map('trim', explode(',', ini_get('disable_functions')));
    if (in_array('exec', $disabled) || !function_exists('exec')) {
        backupLog('exec() disabled — using PDO fallback');
        pdoDump();
        return;
    }

    $bin = findMysqldump();
    if (!$bin) {
        backupLog('mysqldump not found — using PDO fallback');
        pdoDump();
        return;
    }

    $pass    = BACKUP_PASS;
    $passArg = $pass !== '' ? ' -p' . escapeshellarg($pass) : '';

    $cmd = sprintf(
        '%s --single-transaction --routines --triggers --no-tablespaces -h %s -u %s%s %s',
        escapeshellarg($bin),
        escapeshellarg(BACKUP_HOST),
        escapeshellarg(BACKUP_USER),
        $passArg,
        escapeshellarg(BACKUP_DB)
    );

    // Capture output directly instead of shell redirect (avoids permission issues)
    $output   = [];
    $exitCode = 0;
    exec($cmd . ' 2>&1', $output, $exitCode);

    $content = implode("\n", $output);

    if ($exitCode !== 0 || strlen($content) < 100) {
        backupLog('mysqldump failed (exit ' . $exitCode . '): ' . substr($content, 0, 200));
        backupLog('Falling back to PDO dump');
        pdoDump();
        return;
    }

    if (file_put_contents(BACKUP_FILE, $content) === false) {
        backupLog('FAILED: could not write backup file');
        return;
    }

    backupLog('OK (mysqldump) — ' . round(filesize(BACKUP_FILE) / 1024, 1) . ' KB — binary: ' . $bin);
}

runBackup();