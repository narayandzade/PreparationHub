<?php
/**
 * backup.php — auto-detects mysqldump path, uses PDO fallback if exec() is
 * disabled. Writes backup to __DIR__ if writable, otherwise falls back to
 * sys_get_temp_dir() — no sudo or manual chmod needed on any machine.
 */

define('BACKUP_HOST', 'localhost');
define('BACKUP_DB',   'preparation');
define('BACKUP_USER', 'root');
define('BACKUP_PASS', '');

// ── Resolve writable output directory automatically ──────────────────────────
function resolveBackupDir(): string {
    $preferred = __DIR__;

    // Try chmod in case we own the dir (same-user setup)
    if (!is_writable($preferred)) {
        @chmod($preferred, 0775);
    }

    if (is_writable($preferred)) return $preferred;

    // Fall back to system temp — always writable on Mac/Linux/Windows
    return sys_get_temp_dir();
}

$backupDir  = resolveBackupDir();
define('BACKUP_FILE', $backupDir . '/preparation_backup.sql');
define('BACKUP_LOG',  $backupDir . '/backup.log');

function backupLog(string $msg): void {
    @file_put_contents(BACKUP_LOG, '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n", FILE_APPEND);
}

// ── 1. Find mysqldump binary ─────────────────────────────────────────────────
function findMysqldump(): string {
    $candidates = [
        '/Applications/XAMPP/xamppfiles/bin/mysqldump',
        '/Applications/MAMP/Library/bin/mysqldump',
        '/usr/local/bin/mysqldump',
        '/opt/homebrew/bin/mysqldump',
        '/usr/bin/mysqldump',
        '/usr/local/mysql/bin/mysqldump',
        'C:/xampp/mysql/bin/mysqldump.exe',
        'C:/wamp64/bin/mysql/mysql8.0.31/bin/mysqldump.exe',
        'mysqldump',
    ];

    foreach ($candidates as $path) {
        if (@is_executable($path)) return $path;
    }

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
        $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
        $out .= "DROP TABLE IF EXISTS `$table`;\n";
        $out .= $create[1] . ";\n\n";

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
        backupLog('PDO fallback: file_put_contents failed');
        return;
    }
    backupLog('OK (PDO fallback) — ' . round(filesize(BACKUP_FILE) / 1024, 1) . ' KB — saved to: ' . BACKUP_FILE);
}

// ── 3. Main backup logic ─────────────────────────────────────────────────────
function runBackup(): void {
    backupLog('Backup dir: ' . dirname(BACKUP_FILE));

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

    $output   = [];
    $exitCode = 0;
    exec($cmd . ' 2>&1', $output, $exitCode);

    $content = implode("\n", $output);

    // exit 0 = success, exit 2 = warnings (still valid output) — only exit 1 is a real error
    if ($exitCode === 1 || strlen($content) < 100) {
        backupLog('mysqldump failed (exit ' . $exitCode . '): ' . substr($content, 0, 200));
        backupLog('Falling back to PDO dump');
        pdoDump();
        return;
    }

    if (file_put_contents(BACKUP_FILE, $content) === false) {
        backupLog('FAILED: could not write backup file — ' . BACKUP_FILE);
        return;
    }

    backupLog('OK (mysqldump) — ' . round(filesize(BACKUP_FILE) / 1024, 1) . ' KB — binary: ' . $bin . ' — saved to: ' . BACKUP_FILE);
}

runBackup();