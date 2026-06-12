<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'database.php';

$action = $_POST['action'] ?? $_GET['action'] ?? '';

if ($action === 'run_query') {
    $sql = trim($_POST['sql'] ?? '');
    if (!$sql) {
        echo json_encode(['success' => false, 'error' => 'No query provided.']);
        exit;
    }

    $conn = getConnection();
    if (!$conn) {
        echo json_encode(['success' => false, 'error' => 'Database connection failed. Check credentials in database.php.']);
        exit;
    }

    $queries = array_filter(array_map('trim', explode(';', $sql)), fn($q) => $q !== '');
    $results = [];
    $start = microtime(true);

    foreach ($queries as $query) {
        if (!$query) continue;
        $res = $conn->query($query);
        if ($res === false) {
            $results[] = ['success' => false, 'query' => $query, 'error' => $conn->error];
        } elseif ($res === true) {
            $results[] = [
                'success' => true,
                'query' => $query,
                'type' => 'write',
                'affected_rows' => $conn->affected_rows,
                'message' => 'Query OK, ' . $conn->affected_rows . ' row(s) affected.'
            ];
        } else {
            $columns = [];
            $fields = $res->fetch_fields();
            foreach ($fields as $f) {
                $columns[] = ['name' => $f->name, 'type' => $f->type];
            }
            $rows = [];
            while ($row = $res->fetch_assoc()) {
                $rows[] = $row;
            }
            $results[] = [
                'success' => true,
                'query' => $query,
                'type' => 'select',
                'columns' => $columns,
                'rows' => $rows,
                'row_count' => count($rows)
            ];
            $res->free();
        }
    }

    $elapsed = round((microtime(true) - $start) * 1000, 2);
    $conn->close();

    echo json_encode(['success' => true, 'results' => $results, 'elapsed_ms' => $elapsed]);
    exit;
}

if ($action === 'get_schema') {
    $conn = getConnection();
    if (!$conn) {
        echo json_encode(['success' => false, 'error' => 'Connection failed.']);
        exit;
    }

    $schema = [];
    $tables = $conn->query("SHOW TABLES");
    while ($t = $tables->fetch_array()) {
        $table = $t[0];
        $cols = [];
        $colRes = $conn->query("SHOW COLUMNS FROM `$table`");
        while ($col = $colRes->fetch_assoc()) {
            $cols[] = ['field' => $col['Field'], 'type' => $col['Type'], 'key' => $col['Key'], 'null' => $col['Null']];
        }
        $countRes = $conn->query("SELECT COUNT(*) as c FROM `$table`");
        $count = $countRes->fetch_assoc()['c'];
        $schema[] = ['table' => $table, 'columns' => $cols, 'row_count' => $count];
    }

    $conn->close();
    echo json_encode(['success' => true, 'schema' => $schema]);
    exit;
}

if ($action === 'get_snippets') {
    $snippets = [
        ['label' => 'All Tables', 'sql' => "SHOW TABLES;"],
        ['label' => 'All Employees', 'sql' => "SELECT * FROM employees LIMIT 20;"],
        ['label' => 'Employee + Department', 'sql' => "SELECT e.emp_id, CONCAT(e.first_name,' ',e.last_name) AS name,\n       e.job_title, e.salary, d.dept_name\nFROM employees e\nINNER JOIN departments d ON e.dept_id = d.dept_id\nORDER BY e.salary DESC;"],
        ['label' => 'Self Join (Manager)', 'sql' => "SELECT e.emp_id,\n       CONCAT(e.first_name,' ',e.last_name) AS employee,\n       CONCAT(m.first_name,' ',m.last_name) AS manager\nFROM employees e\nLEFT JOIN employees m ON e.manager_id = m.emp_id\nORDER BY m.last_name;"],
        ['label' => 'Salary by Dept', 'sql' => "SELECT d.dept_name,\n       COUNT(e.emp_id) AS headcount,\n       ROUND(AVG(e.salary),2) AS avg_salary,\n       MAX(e.salary) AS max_salary,\n       SUM(e.salary) AS total_payroll\nFROM departments d\nLEFT JOIN employees e ON d.dept_id = e.dept_id\nGROUP BY d.dept_name\nORDER BY total_payroll DESC;"],
        ['label' => 'Window RANK', 'sql' => "SELECT dept_id,\n       CONCAT(first_name,' ',last_name) AS name,\n       salary,\n       RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dept_rank\nFROM employees\nWHERE status = 'active';"],
        ['label' => 'Running Total', 'sql' => "SELECT order_date, total_amount,\n       SUM(total_amount) OVER (ORDER BY order_date) AS running_total\nFROM orders\nWHERE status = 'delivered'\nORDER BY order_date;"],
        ['label' => 'Top Products Revenue', 'sql' => "SELECT p.product_name, p.category,\n       SUM(oi.quantity * oi.unit_price) AS revenue,\n       SUM(oi.quantity) AS units_sold\nFROM order_items oi\nJOIN products p ON oi.product_id = p.product_id\nGROUP BY p.product_id, p.product_name, p.category\nORDER BY revenue DESC\nLIMIT 10;"],
        ['label' => 'Subquery (Above Avg Salary)', 'sql' => "SELECT emp_id, CONCAT(first_name,' ',last_name) AS name,\n       salary, job_title\nFROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees)\nORDER BY salary DESC;"],
        ['label' => 'CTE Example', 'sql' => "WITH dept_avg AS (\n  SELECT dept_id, AVG(salary) AS avg_sal\n  FROM employees GROUP BY dept_id\n)\nSELECT e.first_name, e.last_name,\n       e.salary, da.avg_sal AS dept_avg,\n       ROUND(e.salary - da.avg_sal, 2) AS diff\nFROM employees e\nJOIN dept_avg da ON e.dept_id = da.dept_id\nORDER BY diff DESC;"],
        ['label' => 'Customer Orders Summary', 'sql' => "SELECT CONCAT(c.first_name,' ',c.last_name) AS customer,\n       c.loyalty_tier,\n       COUNT(o.order_id) AS total_orders,\n       SUM(o.total_amount) AS total_spent,\n       MAX(o.order_date) AS last_order\nFROM customers c\nLEFT JOIN orders o ON c.customer_id = o.customer_id\nGROUP BY c.customer_id, customer, c.loyalty_tier\nORDER BY total_spent DESC;"],
        ['label' => 'Product Stock Alert', 'sql' => "SELECT product_name, category,\n       stock_quantity, reorder_level,\n       (stock_quantity - reorder_level) AS buffer\nFROM products\nWHERE stock_quantity <= reorder_level\nORDER BY buffer ASC;"],
        ['label' => 'CASE WHEN', 'sql' => "SELECT CONCAT(first_name,' ',last_name) AS name,\n       salary,\n       CASE\n         WHEN salary >= 100000 THEN 'Executive'\n         WHEN salary >= 70000 THEN 'Senior'\n         WHEN salary >= 50000 THEN 'Mid'\n         ELSE 'Junior'\n       END AS salary_band\nFROM employees\nORDER BY salary DESC;"],
        ['label' => 'Date Functions', 'sql' => "SELECT CONCAT(first_name,' ',last_name) AS name,\n       hire_date,\n       TIMESTAMPDIFF(YEAR, hire_date, CURDATE()) AS years_at_company,\n       DATE_FORMAT(hire_date,'%b %Y') AS joined\nFROM employees\nORDER BY hire_date;"],
        ['label' => 'EXISTS Subquery', 'sql' => "SELECT CONCAT(first_name,' ',last_name) AS name,\n       job_title, dept_id\nFROM employees e\nWHERE EXISTS (\n  SELECT 1 FROM employee_projects ep\n  WHERE ep.emp_id = e.emp_id\n)\nORDER BY name;"],
    ];
    echo json_encode(['success' => true, 'snippets' => $snippets]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Unknown action.']);