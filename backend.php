<?php
require_once 'database.php';
header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) $body = [];

const ALLOWED_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];
const ALLOWED_LANGUAGE   = ['python', 'javascript', 'php', 'sql', 'bash', 'java', 'text'];
const ALLOWED_STATUS     = ['new', 'reading', 'done'];

function res($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function err($msg, $code = 400) { res(['success' => false, 'message' => $msg], $code); }

function decode_points($raw) {
    $p = $raw ? json_decode($raw, true) : [];
    return is_array($p) ? $p : [];
}
function clean_icon($v) {
    $v = trim((string)$v);
    return preg_match('/^bi-[a-z0-9-]+$/', $v) ? $v : 'bi-folder';
}
function clean_color($v) {
    $v = trim((string)$v);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? $v : '#0d9488';
}
function make_slug(PDO $pdo, $name) {
    $base = trim(strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name)), '-');
    if ($base === '') $base = 'topic';
    $slug = $base;
    $i = 1;
    $st = $pdo->prepare('SELECT id FROM topics WHERE slug=?');
    while (true) {
        $st->execute([$slug]);
        if (!$st->fetch()) break;
        $slug = $base . '-' . $i++;
    }
    return $slug;
}

try {
    if ($action === 'get_topics' && $method === 'GET') {
        $rows = $pdo->query(
            'SELECT t.*, COUNT(q.id) AS question_count FROM topics t
             LEFT JOIN questions q ON q.topic_id = t.id
             GROUP BY t.id ORDER BY t.sort_order, t.name'
        )->fetchAll();
        res(['success' => true, 'data' => $rows]);
    }

    if ($action === 'save_topic' && $method === 'POST') {
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '') err('Name required');
        $icon  = clean_icon($body['icon'] ?? 'bi-folder');
        $color = clean_color($body['color'] ?? '#0d9488');
        $order = (int)($body['sort_order'] ?? 0);

        if (!empty($body['id'])) {
            $st = $pdo->prepare('UPDATE topics SET name=?,icon=?,color=?,sort_order=? WHERE id=?');
            $st->execute([$name, $icon, $color, $order, (int)$body['id']]);
            res(['success' => true, 'message' => 'Topic updated!']);
        }

        $slug = make_slug($pdo, $name);
        $st = $pdo->prepare('INSERT INTO topics (name,slug,icon,color,sort_order) VALUES (?,?,?,?,?)');
        $st->execute([$name, $slug, $icon, $color, $order]);
        res(['success' => true, 'id' => $pdo->lastInsertId(), 'message' => 'Topic added!']);
    }

    if ($action === 'delete_topic' && $method === 'POST') {
        $id = (int)($body['id'] ?? 0);
        if (!$id) err('ID required');
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM questions WHERE topic_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM topics WHERE id=?')->execute([$id]);
        $pdo->commit();
        res(['success' => true, 'message' => 'Topic deleted!']);
    }

    if ($action === 'get_questions' && $method === 'GET') {
        $tid = (int)($_GET['topic_id'] ?? 0);
        if (!$tid) err('topic_id required');
        $st = $pdo->prepare('SELECT * FROM questions WHERE topic_id=? ORDER BY sort_order, id');
        $st->execute([$tid]);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) $r['points'] = decode_points($r['points']);
        unset($r);
        res(['success' => true, 'data' => $rows]);
    }

    if ($action === 'get_question' && $method === 'GET') {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) err('ID required');
        $st = $pdo->prepare('SELECT * FROM questions WHERE id=?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) err('Not found', 404);
        $row['points'] = decode_points($row['points']);
        res(['success' => true, 'data' => $row]);
    }

    if ($action === 'save_question' && $method === 'POST') {
        $topicId  = (int)($body['topic_id'] ?? 0);
        $question = trim((string)($body['question'] ?? ''));
        $answer   = (string)($body['answer'] ?? '');
        if (!$topicId || $question === '' || trim($answer) === '') err('topic_id, question and answer required');

        $chk = $pdo->prepare('SELECT id FROM topics WHERE id=?');
        $chk->execute([$topicId]);
        if (!$chk->fetch()) err('Topic not found', 404);

        $difficulty = in_array($body['difficulty'] ?? '', ALLOWED_DIFFICULTY, true) ? $body['difficulty'] : 'intermediate';
        $language   = in_array($body['language'] ?? '', ALLOWED_LANGUAGE, true) ? $body['language'] : 'python';
        $order      = (int)($body['sort_order'] ?? 0);
        $code       = (string)($body['code_example'] ?? '');
        // null = "not sent", so an existing description is kept on update
        $desc       = array_key_exists('description', $body) ? (string)$body['description'] : null;

        $pts = is_array($body['points'] ?? null)
            ? json_encode(array_values($body['points']))
            : json_encode(array_values(array_filter(array_map('trim', explode("\n", (string)($body['points'] ?? ''))), 'strlen')));

        if (!empty($body['id'])) {
            $st = $pdo->prepare('UPDATE questions SET topic_id=?,question=?,answer=?,description=COALESCE(?,description),difficulty=?,points=?,code_example=?,language=?,sort_order=? WHERE id=?');
            $st->execute([$topicId, $question, $answer, $desc, $difficulty, $pts, $code, $language, $order, (int)$body['id']]);
            res(['success' => true, 'message' => 'Question updated!']);
        }

        $st = $pdo->prepare('INSERT INTO questions (topic_id,question,answer,description,difficulty,points,code_example,language,sort_order) VALUES (?,?,?,?,?,?,?,?,?)');
        $st->execute([$topicId, $question, $answer, $desc ?? '', $difficulty, $pts, $code, $language, $order]);
        res(['success' => true, 'id' => $pdo->lastInsertId(), 'message' => 'Question added!']);
    }

    if ($action === 'delete_question' && $method === 'POST') {
        $id = (int)($body['id'] ?? 0);
        if (!$id) err('ID required');
        $pdo->prepare('DELETE FROM questions WHERE id=?')->execute([$id]);
        res(['success' => true, 'message' => 'Question deleted!']);
    }

    if ($action === 'update_status' && $method === 'POST') {
        $id = (int)($body['id'] ?? 0);
        $status = $body['status'] ?? '';
        if (!$id || $status === '') err('id and status required');
        if (!in_array($status, ALLOWED_STATUS, true)) err('Invalid status');
        $st = $pdo->prepare('UPDATE questions SET status=? WHERE id=?');
        $st->execute([$status, $id]);
        res(['success' => true, 'status' => $status]);
    }

    if ($action === 'search' && $method === 'GET') {
        $q = trim((string)($_GET['q'] ?? ''));
        if (mb_strlen($q) < 2) err('Query too short');
        $like = '%' . addcslashes($q, '\\%_') . '%';
        $st = $pdo->prepare(
            'SELECT q.*, t.name AS topic_name FROM questions q
             JOIN topics t ON t.id = q.topic_id
             WHERE q.question LIKE ? OR q.answer LIKE ? OR q.description LIKE ?
             ORDER BY q.id LIMIT 60'
        );
        $st->execute([$like, $like, $like]);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) $r['points'] = decode_points($r['points']);
        unset($r);
        res(['success' => true, 'data' => $rows]);
    }

    err('Unknown action', 404);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    error_log('[prep-hub] ' . $e->getMessage());
    err('Server error. Please try again.', 500);
}