<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SQLPad — Practice DB</title>
<link rel="stylesheet" href="style.css">
</head>
<body>

<header class="header">
    <div class="header-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>
            <path d="M3 12a9 3 0 0 0 18 0"/>
        </svg>
        <span>SQL<em>Pad</em></span>
    </div>
    <div class="header-sep"></div>
    <div class="db-badge" id="db-badge">
        <div class="db-dot offline" id="db-dot"></div>
        <span id="db-label">Connecting…</span>
    </div>
</header>

<div class="layout">

    <aside class="sidebar" id="sidebar">
        <div class="sidebar-tabs">
            <button class="sidebar-tab active" data-panel="schema" onclick="switchPanel('schema', this)">Schema</button>
            <button class="sidebar-tab" data-panel="snippets" onclick="switchPanel('snippets', this)">Snippets</button>
        </div>

        <div class="sidebar-panel active" id="panel-schema">
            <div class="sidebar-search">
                <input type="text" id="schema-search" placeholder="Search tables…" oninput="filterSchema(this.value)">
            </div>
            <div class="sidebar-list" id="schema-list">
                <div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Loading schema…</div>
            </div>
        </div>

        <div class="sidebar-panel" id="panel-snippets">
            <div class="sidebar-list" id="snippets-list">
                <div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Loading snippets…</div>
            </div>
        </div>
    </aside>

    <div class="sidebar-resize" id="sidebar-resize"></div>

    <main class="main">
        <div class="editor-area" id="editor-area">
            <div class="editor-toolbar">
                <span class="editor-label">Query Editor</span>
                <div class="toolbar-sep"></div>
                <span class="shortcut-hint"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> to run</span>
                <button class="btn btn-format" onclick="formatSQL()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H7M21 6H3M21 14H3M21 18H7"/></svg>
                    Format
                </button>
                <button class="btn btn-clear" onclick="clearEditor()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                    Clear
                </button>
                <button class="btn btn-run" id="run-btn" onclick="runQuery()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    Run
                </button>
            </div>
            <div class="editor-wrapper">
                <div class="line-numbers" id="line-numbers"><span>1</span></div>
                <textarea id="sql-editor" spellcheck="false" placeholder="-- Write your SQL here&#10;SELECT * FROM employees LIMIT 10;"></textarea>
            </div>
        </div>

        <div class="resize-bar" id="resize-bar"></div>

        <div class="results-area">
            <div class="results-toolbar">
                <span class="results-label">Results</span>
                <div class="result-tabs" id="result-tabs"></div>
                <span class="elapsed-badge" id="elapsed-badge"></span>
            </div>
            <div class="results-content" id="results-content">
                <div class="empty-state" id="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>
                    </svg>
                    <p>Run a query to see results</p>
                </div>
                <div class="loader" id="loader">
                    <div class="spinner"></div>
                    <span>Executing query…</span>
                </div>
                <div id="result-blocks"></div>
            </div>
        </div>
    </main>
</div>

<div class="toast-container" id="toast-container"></div>

<script>
const editor = document.getElementById('sql-editor');
const lineNumbers = document.getElementById('line-numbers');
const resultTabs = document.getElementById('result-tabs');
const resultBlocks = document.getElementById('result-blocks');
const emptyState = document.getElementById('empty-state');
const loader = document.getElementById('loader');
const elapsedBadge = document.getElementById('elapsed-badge');
let resultsData = [];

const SQL_KEYWORDS = ['SELECT','FROM','WHERE','JOIN','INNER','LEFT','RIGHT','OUTER','ON','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','DROP','ALTER','TABLE','DATABASE','INDEX','USE','SHOW','DESCRIBE','EXPLAIN','WITH','AS','UNION','ALL','DISTINCT','AND','OR','NOT','IN','LIKE','IS','NULL','EXISTS','BETWEEN','CASE','WHEN','THEN','ELSE','END','ASC','DESC','PRIMARY','KEY','FOREIGN','REFERENCES','AUTO_INCREMENT','DEFAULT','UNIQUE','CONSTRAINT','IF','COUNT','SUM','AVG','MIN','MAX','ROUND','CONCAT','COALESCE','IFNULL','NOW','CURDATE','DATE_FORMAT','TIMESTAMPDIFF','YEAR','MONTH','DAY','PARTITION','OVER','RANK','ROW_NUMBER','LEAD','LAG','EXTRACT'];

function highlightSQL(sql) {
    const escaped = sql.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return escaped;
}

function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_,i) => `<span>${i+1}</span>`).join('');
}

editor.addEventListener('input', updateLineNumbers);
editor.addEventListener('scroll', () => { lineNumbers.scrollTop = editor.scrollTop; });

editor.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); }
    if (e.key === 'Tab') {
        e.preventDefault();
        const s = editor.selectionStart, end = editor.selectionEnd;
        editor.value = editor.value.substring(0,s) + '  ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = s + 2;
        updateLineNumbers();
    }
});

updateLineNumbers();

function clearEditor() {
    editor.value = '';
    updateLineNumbers();
    editor.focus();
}

function formatSQL() {
    let sql = editor.value.trim();
    if (!sql) return;
    const keywords = ['SELECT','FROM','WHERE','JOIN','LEFT JOIN','RIGHT JOIN','INNER JOIN','ON','GROUP BY','ORDER BY','HAVING','LIMIT','UNION','WITH','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM'];
    keywords.forEach(kw => {
        sql = sql.replace(new RegExp('\\b' + kw + '\\b', 'gi'), '\n' + kw);
    });
    sql = sql.split('\n').map(l => l.trimStart()).filter(l => l).join('\n');
    editor.value = sql;
    updateLineNumbers();
}

async function runQuery() {
    const sql = editor.value.trim();
    if (!sql) { toast('Write a query first.', 'error'); return; }

    emptyState.style.display = 'none';
    resultBlocks.innerHTML = '';
    resultTabs.innerHTML = '';
    elapsedBadge.textContent = '';
    loader.classList.add('show');

    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px"></div> Running…';

    try {
        const fd = new FormData();
        fd.append('action', 'run_query');
        fd.append('sql', sql);
        const res = await fetch('backend.php', { method: 'POST', body: fd });
        const data = await res.json();

        loader.classList.remove('show');
        btn.disabled = false;
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Run';

        if (!data.success) { renderError(null, data.error); return; }

        elapsedBadge.textContent = data.elapsed_ms + ' ms';
        resultsData = data.results;
        data.results.forEach((r, i) => renderResult(r, i));
        if (data.results.length > 0) activateTab(0);

    } catch(err) {
        loader.classList.remove('show');
        btn.disabled = false;
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Run';
        renderError(null, 'Network error: ' + err.message);
    }
}

function renderResult(r, index) {
    const tab = document.createElement('button');
    tab.className = 'result-tab' + (r.success ? '' : ' error');
    tab.textContent = r.success ? (r.type === 'select' ? `#${index+1} (${r.row_count} rows)` : `#${index+1} OK`) : `#${index+1} Error`;
    tab.onclick = () => activateTab(index);
    tab.dataset.index = index;
    resultTabs.appendChild(tab);

    const block = document.createElement('div');
    block.className = 'result-block';
    block.dataset.index = index;

    const queryBox = `<div class="result-query-text">${escHtml(r.query)}</div>`;

    if (!r.success) {
        block.innerHTML = queryBox + `<div class="error-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;margin-right:6px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ${escHtml(r.error)}</div>`;
    } else if (r.type === 'write') {
        block.innerHTML = queryBox + `<div class="write-success">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            ${escHtml(r.message)}</div>`;
    } else {
        const cols = r.columns;
        const rows = r.rows;
        let th = '<th class="row-num-cell">#</th>' + cols.map(c => `<th>${escHtml(c.name)}<span class="col-type">${colTypeLabel(c.type)}</span></th>`).join('');
        let tb = rows.map((row, ri) => {
            const cells = cols.map(c => {
                const val = row[c.name];
                if (val === null) return `<td class="null-val">NULL</td>`;
                const isNum = !isNaN(val) && val !== '';
                return `<td class="${isNum ? 'num-val' : 'str-val'}" title="${escHtml(String(val))}">${escHtml(String(val))}</td>`;
            }).join('');
            return `<tr><td class="row-num-cell">${ri+1}</td>${cells}</tr>`;
        }).join('');

        block.innerHTML = queryBox +
            `<div class="result-meta">
                <span class="meta-badge success">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    ${rows.length} row${rows.length !== 1 ? 's' : ''}
                </span>
                <span class="meta-badge info">${cols.length} column${cols.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>
            <div class="export-row">
                <button class="btn-export" onclick="exportCSV(${index})">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export CSV
                </button>
                <button class="btn-export" onclick="exportJSON(${index})">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export JSON
                </button>
            </div>`;
    }

    resultBlocks.appendChild(block);
}

function renderError(query, msg) {
    resultTabs.innerHTML = '';
    resultBlocks.innerHTML = '';
    const tab = document.createElement('button');
    tab.className = 'result-tab error active';
    tab.textContent = '#1 Error';
    resultTabs.appendChild(tab);

    const block = document.createElement('div');
    block.className = 'result-block active';
    if (query) block.innerHTML = `<div class="result-query-text">${escHtml(query)}</div>`;
    block.innerHTML += `<div class="error-box">${escHtml(msg)}</div>`;
    resultBlocks.appendChild(block);
}

function activateTab(index) {
    document.querySelectorAll('.result-tab').forEach((t,i) => t.classList.toggle('active', i === index));
    document.querySelectorAll('.result-block').forEach(b => b.classList.remove('active'));
    const b = document.querySelector(`.result-block[data-index="${index}"]`);
    if (b) b.classList.add('active');
}

function colTypeLabel(typeNum) {
    const map = {1:'TINYINT',2:'SMALLINT',3:'INT',4:'FLOAT',5:'DOUBLE',8:'BIGINT',9:'MEDIUMINT',10:'DATE',11:'TIME',12:'DATETIME',13:'YEAR',246:'DECIMAL',252:'BLOB',253:'VARCHAR',254:'CHAR',7:'TIMESTAMP'};
    return map[typeNum] || 'TEXT';
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function exportCSV(index) {
    const r = resultsData[index];
    if (!r || r.type !== 'select') return;
    const headers = r.columns.map(c => c.name).join(',');
    const rows = r.rows.map(row => r.columns.map(c => {
        const v = row[c.name];
        if (v === null) return '';
        return '"' + String(v).replace(/"/g,'""') + '"';
    }).join(','));
    download([headers, ...rows].join('\n'), 'result_' + (index+1) + '.csv', 'text/csv');
    toast('CSV exported.', 'success');
}

function exportJSON(index) {
    const r = resultsData[index];
    if (!r || r.type !== 'select') return;
    download(JSON.stringify(r.rows, null, 2), 'result_' + (index+1) + '.json', 'application/json');
    toast('JSON exported.', 'success');
}

function download(content, filename, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], {type: mime}));
    a.download = filename;
    a.click();
}

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<svg class="${type}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}</svg><span>${escHtml(msg)}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function switchPanel(name, btn) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + name).classList.add('active');
}

async function loadSchema() {
    const fd = new FormData();
    fd.append('action', 'get_schema');
    try {
        const res = await fetch('backend.php', {method:'POST', body: fd});
        const data = await res.json();
        const dot = document.getElementById('db-dot');
        const label = document.getElementById('db-label');

        if (!data.success) {
            dot.className = 'db-dot offline';
            label.textContent = 'Disconnected';
            document.getElementById('schema-list').innerHTML = `<div style="padding:14px;color:var(--red);font-size:12px;">Connection failed.<br>Check database.php</div>`;
            return;
        }

        dot.className = 'db-dot';
        label.textContent = 'practice_db';
        renderSchema(data.schema);
    } catch(e) {
        document.getElementById('db-dot').className = 'db-dot offline';
        document.getElementById('db-label').textContent = 'Error';
    }
}

let schemaData = [];

function renderSchema(schema) {
    schemaData = schema;
    buildSchemaList(schema);
}

function buildSchemaList(schema) {
    const list = document.getElementById('schema-list');
    if (!schema.length) { list.innerHTML = '<div style="padding:14px;color:var(--text3);font-size:12px;">No tables found.</div>'; return; }

    list.innerHTML = schema.map(t => {
        const cols = t.columns.map(c => {
            let key = '';
            if (c.key === 'PRI') key = '<span class="key-badge pk">PK</span>';
            else if (c.key === 'MUL') key = '<span class="key-badge fk">FK</span>';
            else if (c.key === 'UNI') key = '<span class="key-badge uni">UQ</span>';
            return `<div class="schema-col" onclick="insertCol('${t.table}','${c.field}')">
                <span class="schema-col-name">${escHtml(c.field)}</span>
                ${key}
                <span class="schema-col-type">${escHtml(c.type.split('(')[0])}</span>
            </div>`;
        }).join('');

        return `<div class="schema-table">
            <div class="schema-table-header" onclick="toggleTable(this)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                <span class="schema-table-name">${escHtml(t.table)}</span>
                <span class="schema-count">${t.row_count}</span>
                <svg class="schema-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <div class="schema-cols">${cols}</div>
        </div>`;
    }).join('');
}

function toggleTable(header) {
    header.classList.toggle('open');
    header.nextElementSibling.classList.toggle('open');
}

function insertCol(table, col) {
    const sel = `\`${table}\`.\`${col}\``;
    const s = editor.selectionStart;
    editor.value = editor.value.substring(0, s) + sel + editor.value.substring(editor.selectionEnd);
    editor.selectionStart = editor.selectionEnd = s + sel.length;
    editor.focus();
    updateLineNumbers();
}

function filterSchema(q) {
    if (!q) { buildSchemaList(schemaData); return; }
    const filtered = schemaData.filter(t => t.table.toLowerCase().includes(q.toLowerCase()) || t.columns.some(c => c.field.toLowerCase().includes(q.toLowerCase())));
    buildSchemaList(filtered);
}

async function loadSnippets() {
    const fd = new FormData();
    fd.append('action', 'get_snippets');
    const res = await fetch('backend.php', {method:'POST', body: fd});
    const data = await res.json();
    if (!data.success) return;

    const list = document.getElementById('snippets-list');
    list.innerHTML = data.snippets.map((s, i) => `
        <div class="snippet-item" onclick="loadSnippet(${i})">
            <div class="snippet-label">${escHtml(s.label)}</div>
            <div class="snippet-preview">${escHtml(s.sql.split('\n')[0])}</div>
        </div>
    `).join('');
    window._snippets = data.snippets;
}

function loadSnippet(i) {
    editor.value = window._snippets[i].sql;
    updateLineNumbers();
    editor.focus();
    toast('Snippet loaded.', 'success');
}

const resizeBar = document.getElementById('resize-bar');
const editorArea = document.getElementById('editor-area');
let isResizing = false;
let startY, startH;

resizeBar.addEventListener('mousedown', e => {
    isResizing = true;
    startY = e.clientY;
    startH = editorArea.offsetHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const newH = Math.max(120, Math.min(startH + e.clientY - startY, window.innerHeight - 200));
    editorArea.style.height = newH + 'px';
    editorArea.style.flexShrink = '0';
});

document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
});

const sidebarResize = document.getElementById('sidebar-resize');
const sidebar = document.getElementById('sidebar');
let isSideResizing = false;
let startX, startW;

sidebarResize.addEventListener('mousedown', e => {
    isSideResizing = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', e => {
    if (!isSideResizing) return;
    const w = Math.max(180, Math.min(startW + e.clientX - startX, 500));
    sidebar.style.width = w + 'px';
});

document.addEventListener('mouseup', () => {
    isSideResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
});

loadSchema();
loadSnippets();
</script>
</body>
</html>