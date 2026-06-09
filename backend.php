<?php
require_once 'database.php';
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

function res($data, $code = 200) { http_response_code($code); echo json_encode($data); exit; }
function err($msg, $code = 400) { res(['success' => false, 'message' => $msg], $code); }

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
        if (empty($body['name'])) err('Name required');
        $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $body['name']));
        $base = $slug; $i = 1;
        while ($pdo->query("SELECT id FROM topics WHERE slug='$slug'")->fetch()) $slug = $base.'-'.$i++;
        if (!empty($body['id'])) {
            $st = $pdo->prepare('UPDATE topics SET name=?,icon=?,color=?,sort_order=? WHERE id=?');
            $st->execute([$body['name'], $body['icon'] ?? 'bi-folder', $body['color'] ?? '#6c63ff', (int)($body['sort_order'] ?? 0), $body['id']]);
            res(['success' => true, 'message' => 'Topic updated!']);
        }
        $st = $pdo->prepare('INSERT INTO topics (name,slug,icon,color,sort_order) VALUES (?,?,?,?,?)');
        $st->execute([$body['name'], $slug, $body['icon'] ?? 'bi-folder', $body['color'] ?? '#6c63ff', (int)($body['sort_order'] ?? 0)]);
        res(['success' => true, 'id' => $pdo->lastInsertId(), 'message' => 'Topic added!']);
    }

    if ($action === 'delete_topic' && $method === 'POST') {
        if (empty($body['id'])) err('ID required');
        $pdo->prepare('DELETE FROM topics WHERE id=?')->execute([$body['id']]);
        res(['success' => true, 'message' => 'Topic deleted!']);
    }

    if ($action === 'get_questions' && $method === 'GET') {
        $tid = (int)($_GET['topic_id'] ?? 0);
        if (!$tid) err('topic_id required');
        $st = $pdo->prepare('SELECT * FROM questions WHERE topic_id=? ORDER BY sort_order, id');
        $st->execute([$tid]);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) $r['points'] = $r['points'] ? json_decode($r['points'], true) : [];
        res(['success' => true, 'data' => $rows]);
    }

    if ($action === 'get_question' && $method === 'GET') {
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) err('ID required');
        $st = $pdo->prepare('SELECT * FROM questions WHERE id=?');
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) err('Not found', 404);
        $row['points'] = $row['points'] ? json_decode($row['points'], true) : [];
        res(['success' => true, 'data' => $row]);
    }

    if ($action === 'save_question' && $method === 'POST') {
        if (empty($body['topic_id']) || empty($body['question']) || empty($body['answer'])) err('topic_id, question and answer required');
        $pts = is_array($body['points'] ?? null)
            ? json_encode($body['points'])
            : json_encode(array_values(array_filter(array_map('trim', explode("\n", $body['points'] ?? '')))));
        if (!empty($body['id'])) {
            $st = $pdo->prepare('UPDATE questions SET topic_id=?,question=?,answer=?,description=?,difficulty=?,points=?,code_example=?,sort_order=? WHERE id=?');
            $st->execute([$body['topic_id'],$body['question'],$body['answer'],$body['description']??'',$body['difficulty']??'intermediate',$pts,$body['code_example']??'',(int)($body['sort_order']??0),$body['id']]);
            res(['success' => true, 'message' => 'Question updated!']);
        }
        $st = $pdo->prepare('INSERT INTO questions (topic_id,question,answer,description,difficulty,points,code_example,sort_order) VALUES (?,?,?,?,?,?,?,?)');
        $st->execute([$body['topic_id'],$body['question'],$body['answer'],$body['description']??'',$body['difficulty']??'intermediate',$pts,$body['code_example']??'',(int)($body['sort_order']??0)]);
        res(['success' => true, 'id' => $pdo->lastInsertId(), 'message' => 'Question added!']);
    }

    if ($action === 'delete_question' && $method === 'POST') {
        if (empty($body['id'])) err('ID required');
        $pdo->prepare('DELETE FROM questions WHERE id=?')->execute([$body['id']]);
        res(['success' => true, 'message' => 'Question deleted!']);
    }

    if ($action === 'update_status' && $method === 'POST') {
        if (empty($body['id']) || empty($body['status'])) err('id and status required');
        $allowed = ['new', 'reading', 'done'];
        if (!in_array($body['status'], $allowed)) err('Invalid status');
        $st = $pdo->prepare('UPDATE questions SET status=? WHERE id=?');
        $st->execute([$body['status'], $body['id']]);
        res(['success' => true, 'status' => $body['status']]);
    }

    if ($action === 'search' && $method === 'GET') {
        $q = $_GET['q'] ?? '';
        if (strlen($q) < 2) err('Query too short');
        $like = '%'.$q.'%';
        $st = $pdo->prepare('SELECT q.*,t.name AS topic_name FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.question LIKE ? OR q.answer LIKE ? OR q.description LIKE ? ORDER BY q.id LIMIT 60');
        $st->execute([$like,$like,$like]);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) $r['points'] = $r['points'] ? json_decode($r['points'], true) : [];
        res(['success' => true, 'data' => $rows]);
    }

    err('Unknown action', 404);
} catch (Throwable $e) {
    err('Server error: '.$e->getMessage(), 500);
}