<?php
// debug_backup.php
// Open this directly in browser: http://localhost/preparation/debug_backup.php
// DELETE this file after fixing the backup issue.

header('Content-Type: text/plain');

echo "=== BACKUP DEBUG ===\n\n";

// 1. PHP info
echo "PHP version: " . PHP_VERSION . "\n";
echo "OS: " . PHP_OS_FAMILY . "\n";
echo "Script dir: " . __DIR__ . "\n\n";

// 2. Write permission
$file = __DIR__ . '/preparation_backup.sql';
$log  = __DIR__ . '/backup.log';
echo "--- Write permission ---\n";
echo "Dir writable: " . (is_writable(__DIR__) ? 'YES' : 'NO ← PROBLEM') . "\n";
echo "Backup file target: $file\n\n";

// 3. exec() availability
echo "--- exec() ---\n";
$disabled = array_map('trim', explode(',', ini_get('disable_functions')));
$execOk   = !in_array('exec', $disabled) && function_exists('exec');
echo "exec() available: " . ($execOk ? 'YES' : 'NO ← PROBLEM') . "\n";
echo "disable_functions: " . ini_get('disable_functions') . "\n\n";

// 4. Find mysqldump
echo "--- mysqldump search ---\n";
$candidates = [
    '/Applications/XAMPP/xamppfiles/bin/mysqldump',
    '/Applications/MAMP/Library/bin/mysqldump',
    '/usr/local/bin/mysqldump',
    '/opt/homebrew/bin/mysqldump',
    '/opt/homebrew/opt/mysql/bin/mysqldump',
    '/usr/bin/mysqldump',
    '/usr/local/mysql/bin/mysqldump',
    '/usr/local/mysql-8.0/bin/mysqldump',
];

$found = '';
foreach ($candidates as $path) {
    $exists = file_exists($path);
    $exec   = @is_executable($path);
    echo "$path — exists:" . ($exists?'Y':'N') . " exec:" . ($exec?'Y':'N') . "\n";
    if ($exec && !$found) $found = $path;
}

// which/where fallback
$which = trim((string) shell_exec('which mysqldump 2>/dev/null'));
echo "which mysqldump: " . ($which ?: 'not found') . "\n";
if (!$found && $which) $found = $which;

echo "\nBest candidate: " . ($found ?: 'NONE FOUND') . "\n\n";

// 5. Try running mysqldump
if ($found) {
    echo "--- Test mysqldump run ---\n";
    $cmd = escapeshellarg($found) . ' --version 2>&1';
    $out = [];
    $code = 0;
    exec($cmd, $out, $code);
    echo "Exit code: $code\n";
    echo "Output: " . implode(' ', $out) . "\n\n";

    // actual dump test
    echo "--- Attempt real dump ---\n";
    $dumpCmd = escapeshellarg($found) . ' --single-transaction --no-tablespaces -h localhost -u root preparation 2>&1';
    $dumpOut = [];
    $dumpCode = 0;
    exec($dumpCmd, $dumpOut, $dumpCode);
    $content = implode("\n", $dumpOut);
    echo "Exit code: $dumpCode\n";
    echo "Output length: " . strlen($content) . " bytes\n";
    if ($dumpCode !== 0) {
        echo "Error output: " . substr($content, 0, 300) . "\n";
    } else {
        // write it
        $written = file_put_contents($file, $content);
        echo "file_put_contents result: " . ($written !== false ? "$written bytes written ✓" : "FAILED ← check permissions") . "\n";
    }
} else {
    echo "--- No mysqldump found — testing PDO fallback ---\n";
    try {
        $pdo = new PDO('mysql:host=localhost;dbname=preparation;charset=utf8mb4', 'root', '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        echo "PDO connect: OK\n";
        $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        echo "Tables found: " . implode(', ', $tables) . "\n";

        $out = "-- PDO backup test\n-- " . date('Y-m-d H:i:s') . "\nSET FOREIGN_KEY_CHECKS=0;\n\n";
        foreach ($tables as $table) {
            $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM);
            $out .= "DROP TABLE IF EXISTS `$table`;\n" . $create[1] . ";\n\n";
            $rows = $pdo->query("SELECT * FROM `$table`")->fetchAll(PDO::FETCH_ASSOC);
            if ($rows) {
                $cols = '`' . implode('`, `', array_keys($rows[0])) . '`';
                $out .= "INSERT INTO `$table` ($cols) VALUES\n";
                $lines = [];
                foreach ($rows as $row) {
                    $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v), array_values($row));
                    $lines[] = '(' . implode(', ', $vals) . ')';
                }
                $out .= implode(",\n", $lines) . ";\n\n";
            }
        }
        $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
        $written = file_put_contents($file, $out);
        echo "PDO dump written: " . ($written !== false ? round($written/1024,1) . " KB ✓" : "FAILED") . "\n";
    } catch (Throwable $e) {
        echo "PDO connect FAILED: " . $e->getMessage() . "\n";
    }
}

// 6. Check backup.log
echo "\n--- backup.log contents ---\n";
if (file_exists($log)) {
    echo file_get_contents($log);
} else {
    echo "(no backup.log exists yet)\n";
}

echo "\n=== END DEBUG ===\n";