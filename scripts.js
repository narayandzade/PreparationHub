const API = 'backend.php';
let topics = [];
let activeTopic = null;
let activeFilter = 'all';
let activeStatusFilter = 'all';
let editingQuestion = null;
let editingTopic = null;
let codeEditor = null;
let quillAnswer = null;
let allQuestionsCache = {};

const K = {
    topic: 'prep_active_topic',
    filter: 'prep_active_filter',
    statusFilter: 'prep_status_filter',
    scroll: 'prep_scroll_pos',
    openMap: 'prep_open_map',
    theme: 'prep_theme',
    reads: 'prep_reads_',
    last: 'prep_lastread_',
    sets: 'prep_sets_',
    time: 'prep_time_',
    day: 'prep_day_',
};

const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
    del: k => { try { localStorage.removeItem(k); } catch (_) {} },
};

const STATUS_CYCLE = { new: 'reading', reading: 'done', done: 'new' };
const STATUS_META = {
    new: { label: 'New', icon: 'bi-circle', cls: 'status-new' },
    reading: { label: 'Reading', icon: 'bi-book-half', cls: 'status-reading' },
    done: { label: 'Done', icon: 'bi-check-circle-fill', cls: 'status-done' },
};
const LANG_LABEL = { python: 'Python', javascript: 'JavaScript', php: 'PHP', sql: 'SQL', bash: 'Bash', java: 'Java', text: 'Text' };

async function req(action, method = 'GET', body = null, params = {}) {
    const url = new URL(API, location.href);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applyTheme(theme, animate) {
    const root = document.documentElement;
    if (animate) {
        root.classList.add('theme-anim');
        setTimeout(() => root.classList.remove('theme-anim'), 450);
    }
    root.setAttribute('data-theme', theme);
    ls.set(K.theme, theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = theme === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
    const meta = document.getElementById('metaThemeColor');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#061416' : '#0d9488');
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark', true);
}

const statusOf = q => (STATUS_META[q?.status] ? q.status : 'new');

function purgeLegacyLocalStatuses() {
    try {
        Object.keys(localStorage)
            .filter(k => /^prep_status_\d+$/.test(k))
            .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
}

const getReads = id => parseInt(ls.get(K.reads + id)) || 0;
const getLastRead = id => parseInt(ls.get(K.last + id)) || 0;
const getSets = id => parseInt(ls.get(K.sets + id)) || 0;
const getTime = id => parseInt(ls.get(K.time + id)) || 0;

function fmtClock(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
}

function fmtShort(s) {
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
}

function relTime(ts) {
    if (!ts) return 'never';
    const startOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const days = Math.round((startOf(Date.now()) - startOf(ts)) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return days + ' days ago';
}

function setLevel(n) {
    if (n >= 3) return 'Interview ready';
    if (n === 2) return 'Getting solid';
    if (n === 1) return 'Learning';
    return 'Not revised yet';
}

function dayKey(d = new Date()) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const daySecs = d => parseInt(ls.get(K.day + dayKey(d))) || 0;

function streakDays() {
    const d = new Date();
    if (!daySecs(d)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (daySecs(d) > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
}

function paintStudy() {
    const a = document.getElementById('streakNum');
    const b = document.getElementById('todayTime');
    if (a) a.textContent = streakDays();
    if (b) b.textContent = fmtShort(daySecs(new Date()));
}

function findQ(id) {
    const list = allQuestionsCache[activeTopic?.id] || [];
    return list.find(x => x.id == id);
}

function readSeconds(q) {
    const strip = s => String(s || '').replace(/<[^>]*>/g, ' ');
    const words = (strip(q?.answer) + ' ' + strip(q?.description) + ' ' + (Array.isArray(q?.points) ? q.points.join(' ') : '')).split(/\s+/).filter(Boolean).length;
    return Math.max(20, Math.round((words / 180) * 60));
}

function readTimeLabel(q) {
    const s = readSeconds(q);
    return s < 60 ? `~${s}s` : `~${Math.ceil(s / 60)} min`;
}

const timer = { id: null, iv: null, session: 0, est: 60, ticks: 0 };

function startTimer(id) {
    stopTimer();
    timer.id = id;
    timer.session = 0;
    timer.ticks = 0;
    timer.est = readSeconds(findQ(id));
    timer.iv = setInterval(tickTimer, 1000);
    paintTracker(id);
}

function stopTimer() {
    if (timer.iv) clearInterval(timer.iv);
    timer.iv = null;
    timer.id = null;
}

function tickTimer() {
    if (document.hidden || !timer.id) return;
    timer.session++;
    timer.ticks++;
    ls.set(K.time + timer.id, String(getTime(timer.id) + 1));
    const dk = K.day + dayKey();
    ls.set(dk, String((parseInt(ls.get(dk)) || 0) + 1));
    paintTracker(timer.id, true);
    paintStudy();
    if (timer.ticks % 10 === 0 && activeTopic) renderTopicStats(activeTopic.id);
}

function paintTracker(id, live) {
    const box = document.getElementById('trk-' + id);
    if (!box) return;
    const set = (k, v) => { const el = box.querySelector(`[data-t="${k}"]`); if (el && el.textContent !== String(v)) el.textContent = v; };
    const isTimed = timer.id == id;
    const sess = isTimed ? timer.session : 0;
    const est = isTimed ? timer.est : readSeconds(findQ(id));
    set('session', fmtClock(sess));
    set('est', `of ${readTimeLabel(findQ(id))} estimate`);
    set('total', fmtClock(getTime(id)));
    set('sets', getSets(id));
    set('level', setLevel(getSets(id)));
    set('opens', getReads(id));
    set('last', 'last read ' + relTime(getLastRead(id)));
    const bar = box.querySelector('[data-t="bar"]');
    if (bar) {
        const pct = Math.min(100, Math.round((sess / est) * 100));
        bar.style.width = pct + '%';
        bar.classList.toggle('full', pct >= 100);
    }
    if (!live) paintBadges(id);
}

function paintBadges(id, bump) {
    const reads = document.querySelector(`.mini-badge.read[data-b="${id}"]`);
    const sets = document.querySelector(`.mini-badge.sets[data-b="${id}"]`);
    const apply = (el, n, icon) => {
        if (!el) return;
        el.classList.toggle('is-zero', !n);
        el.innerHTML = `<i class="bi ${icon}"></i><b>${n}</b>`;
        if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    };
    apply(reads, getReads(id), 'bi-eye');
    apply(sets, getSets(id), 'bi-arrow-repeat');
}

function completeSet(id, event) {
    event.stopPropagation();
    ls.set(K.sets + id, String(getSets(id) + 1));
    paintTracker(id);
    paintBadges(id, true);
    const q = findQ(id);
    if (q && statusOf(q) === 'new') setStatus(id, 'reading');
    if (activeTopic) renderTopicStats(activeTopic.id);
    const n = getSets(id);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Set ${n} complete · ${setLevel(n)}`, timer: 1800, showConfirmButton: false });
    if (n === 3) burstConfetti(event.clientX, event.clientY);
}

function bumpRead(id) {
    ls.set(K.reads + id, String(getReads(id) + 1));
    ls.set(K.last + id, String(Date.now()));
    paintBadges(id, true);
    paintTracker(id);
    if (activeTopic) renderTopicStats(activeTopic.id);
}

function getOpenMap() {
    try { return JSON.parse(ls.get(K.openMap)) || {}; } catch (_) { return {}; }
}

function saveOpen(topicId, qid) {
    const m = getOpenMap();
    if (qid) m[topicId] = String(qid); else delete m[topicId];
    ls.set(K.openMap, JSON.stringify(m));
}

function getOpen(topicId) {
    return getOpenMap()[topicId] || null;
}

function setPanelH() {
    const s = document.getElementById('qScroll');
    if (s) s.style.setProperty('--panel-h', s.clientHeight + 'px');
}

function burstConfetti(x, y) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cx = x || innerWidth / 2;
    const cy = y || 160;
    const colors = ['#0d9488', '#22c3a6', '#0891d1', '#e89209', '#ee5d54', '#12a66f'];
    for (let i = 0; i < 44; i++) {
        const p = document.createElement('i');
        p.className = 'confetti-piece';
        const angle = Math.random() * Math.PI * 2;
        const dist = 90 + Math.random() * 190;
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        p.style.background = colors[i % colors.length];
        p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        p.style.setProperty('--dy', Math.sin(angle) * dist - 60 + 'px');
        p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
        p.style.animationDelay = Math.random() * 120 + 'ms';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1800);
    }
}

function paintStatusButtons(id, status) {
    const meta = STATUS_META[status] || STATUS_META.new;
    document.querySelectorAll(`[data-qid="${id}"]`).forEach(btn => {
        const foot = btn.classList.contains('status-btn-foot');
        btn.dataset.status = status;
        btn.className = `status-btn ${meta.cls}${foot ? ' status-btn-foot' : ''}`;
        btn.innerHTML = `<i class="bi ${meta.icon}"></i><span>${meta.label}</span>`;
        btn.title = `Mark as ${STATUS_CYCLE[status]}`;
        btn.setAttribute('onclick', `cycleStatus(${id},'${status}',event)`);
    });
    const card = document.getElementById('qcard-' + id);
    if (card) {
        card.classList.remove('st-new', 'st-reading', 'st-done');
        card.classList.add('st-' + status);
    }
}

async function setStatus(id, next) {
    const q = findQ(id);
    const prev = q ? statusOf(q) : 'new';
    if (q) q.status = next;
    paintStatusButtons(id, next);
    updateTopicProgress(activeTopic?.id);

    let saved = false;
    try {
        const r = await req('update_status', 'POST', { id, status: next });
        saved = !r || r.success !== false;
    } catch (_) {}

    if (!saved) {
        if (q) q.status = prev;
        paintStatusButtons(id, prev);
        updateTopicProgress(activeTopic?.id);
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Could not save status', timer: 2000, showConfirmButton: false });
    }
    return saved;
}

async function cycleStatus(id, current, event) {
    event.stopPropagation();
    const next = STATUS_CYCLE[current] || 'new';
    const x = event.clientX, y = event.clientY;
    const saving = setStatus(id, next);

    document.querySelectorAll(`[data-qid="${id}"]`).forEach(b => {
        b.classList.add('status-animating');
        setTimeout(() => b.classList.remove('status-animating'), 420);
    });
    const card = document.getElementById('qcard-' + id);
    if (card) {
        card.classList.add('status-flash');
        setTimeout(() => card.classList.remove('status-flash'), 700);
    }
    if (next === 'done') {
        const qs = allQuestionsCache[activeTopic?.id] || [];
        if (qs.length && qs.every(q => statusOf(q) === 'done')) burstConfetti(x, y);
    }

    if (!(await saving)) return;
    if (activeStatusFilter !== 'all' && next !== activeStatusFilter && card) {
        card.style.transition = 'opacity .35s, transform .35s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(18px)';
        if (timer.id == id) stopTimer();
        saveOpen(activeTopic.id, null);
        setTimeout(() => { card.remove(); checkEmptyState(); }, 360);
    }
}

function checkEmptyState() {
    const scroll = document.getElementById('qScroll');
    if (!scroll.querySelectorAll('.q-card').length) {
        scroll.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No questions match this filter.</p></div>';
    }
}

function renderTopicStats(topicId) {
    const box = document.getElementById('topicStats');
    if (!box) return;
    const qs = allQuestionsCache[topicId];
    if (!qs) { box.innerHTML = ''; return; }
    let nNew = 0, nReading = 0, nDone = 0, nSets = 0, secs = 0;
    qs.forEach(q => {
        const s = statusOf(q);
        if (s === 'done') nDone++; else if (s === 'reading') nReading++; else nNew++;
        nSets += getSets(q.id);
        secs += getTime(q.id);
    });
    const total = qs.length;
    const pct = total ? Math.round((nDone / total) * 100) : 0;
    const prev = box.querySelector('.ring-fg');
    if (!prev) {
        box.innerHTML = `
            <div class="stats-ring">
                <svg viewBox="0 0 44 44" aria-hidden="true">
                    <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" style="stop-color:var(--a)"></stop><stop offset="100%" style="stop-color:var(--sky)"></stop></linearGradient></defs>
                    <circle class="ring-bg" cx="22" cy="22" r="18"></circle>
                    <circle class="ring-fg" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="0 100"></circle>
                </svg>
                <span class="ring-pct"></span>
            </div>
            <div class="stats-body">
                <div class="stats-chips">
                    <span class="stat-chip sc-reading"><i class="bi bi-book-half"></i><b data-k="reading"></b> reading</span>
                    <span class="stat-chip"><i class="bi bi-circle"></i><b data-k="new"></b> new</span>
                    <span class="stat-chip sc-sets" title="Completed revision sets"><i class="bi bi-arrow-repeat"></i><b data-k="sets"></b> sets</span>
                    <span class="stat-chip sc-time" title="Total study time in this topic"><i class="bi bi-stopwatch"></i><b data-k="time"></b></span>
                </div>
            </div>`;
        box.querySelector('.ring-fg').getBoundingClientRect();
    }
    const setChip = (k, v) => {
        const el = box.querySelector(`[data-k="${k}"]`);
        if (el && el.textContent !== String(v)) {
            el.textContent = v;
            const chip = el.closest('.stat-chip');
            chip.classList.remove('bump');
            void chip.offsetWidth;
            chip.classList.add('bump');
        }
    };
    box.querySelector('.ring-fg').setAttribute('stroke-dasharray', `${pct} 100`);
    box.querySelector('.stats-ring').classList.toggle('complete', pct === 100);
    box.querySelector('.ring-pct').textContent = pct + '%';
    setChip('reading', nReading);
    setChip('new', nNew);
    setChip('sets', nSets);
    setChip('time', fmtShort(secs));
}

function updateTopicProgress(topicId) {
    if (!topicId || !allQuestionsCache[topicId]) return;
    if (activeTopic && activeTopic.id == topicId) renderTopicStats(topicId);
    const qs = allQuestionsCache[topicId];
    const total = qs.length;
    if (!total) return;
    const done = qs.filter(q => statusOf(q) === 'done').length;
    const pct = Math.round((done / total) * 100);
    const bar = document.querySelector(`.topic-progress-bar[data-tid="${topicId}"]`);
    const lbl = document.querySelector(`.topic-progress-lbl[data-tid="${topicId}"]`);
    if (bar) {
        bar.style.width = pct + '%';
        bar.className = `topic-progress-bar${pct === 100 ? ' complete' : ''}`;
    }
    if (lbl) lbl.textContent = `${done}/${total}`;
}

async function loadTopics() {
    const r = await req('get_topics');
    if (!r.success) return;
    topics = r.data;
    await Promise.all(topics.map(t => preloadTopicProgress(t.id)));
    renderTopics();
    restoreState();
}

async function preloadTopicProgress(topicId) {
    if (allQuestionsCache[topicId]) return;
    try {
        const r = await req('get_questions', 'GET', null, { topic_id: topicId });
        if (r.success) allQuestionsCache[topicId] = r.data;
    } catch (_) {}
}

function saveState() {
    if (activeTopic) ls.set(K.topic, activeTopic.id);
    ls.set(K.filter, activeFilter);
    ls.set(K.statusFilter, activeStatusFilter);
}

function syncPills() {
    document.querySelectorAll('.diff-pill').forEach(p => p.classList.toggle('active', p.dataset.f === activeFilter));
    document.querySelectorAll('.status-pill').forEach(p => p.classList.toggle('active', p.dataset.s === activeStatusFilter));
}

function restoreState() {
    const savedTopicId = ls.get(K.topic);
    if (!savedTopicId) return;
    const t = topics.find(x => x.id == savedTopicId);
    if (!t) return;
    activeStatusFilter = ls.get(K.statusFilter) || 'all';
    syncPills();
    selectTopic(t, true);
}

function renderTopics() {
    const list = document.getElementById('topicList');
    list.innerHTML = '';
    topics.forEach(t => {
        const cached = allQuestionsCache[t.id];
        const total = parseInt(t.question_count) || 0;
        const done = cached ? cached.filter(q => statusOf(q) === 'done').length : 0;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const el = document.createElement('div');
        el.className = 'topic-item' + (activeTopic?.id == t.id ? ' active' : '');
        el.dataset.id = t.id;
        el.innerHTML = `
            <div class="topic-icon" style="background:${t.color}22;color:${t.color}"><i class="bi ${t.icon}"></i></div>
            <div class="topic-meta">
                <span class="topic-name">${esc(t.name)}</span>
                <div class="topic-progress-track"><div class="topic-progress-bar${pct === 100 ? ' complete' : ''}" data-tid="${t.id}" style="width:${pct}%"></div></div>
            </div>
            <div class="topic-right">
                <span class="topic-count">${t.question_count}</span>
                <span class="topic-progress-lbl" data-tid="${t.id}">${done ? done + '/' + total : ''}</span>
            </div>
            <div class="topic-actions">
                <button onclick="openEditTopic(event,${t.id})" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="del-btn" onclick="deleteTopic(event,${t.id})" title="Delete"><i class="bi bi-trash"></i></button>
            </div>`;
        el.addEventListener('click', () => { selectTopic(t); if (typeof closeSidebar === 'function') closeSidebar(); });
        list.appendChild(el);
    });
}

function showTopicChrome(show) {
    document.getElementById('mainBar').style.display = show ? 'flex' : 'none';
}

function selectTopic(t, skipSave) {
    stopTimer();
    activeTopic = t;
    if (!skipSave) {
        activeFilter = 'all';
        activeStatusFilter = 'all';
        syncPills();
    }
    renderTopics();
    document.getElementById('mainTitle').textContent = t.name;
    document.getElementById('mainIcon').innerHTML = `<i class="bi ${t.icon}" style="color:${t.color}"></i>`;
    document.getElementById('topAddQBtn').style.display = 'inline-flex';
    document.getElementById('mbnAddQ').style.display = 'flex';
    showTopicChrome(true);
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('qScroll').style.display = 'block';
    setPanelH();
    renderTopicStats(t.id);
    loadQuestions(t.id);
    saveState();
}

async function loadQuestions(topicId) {
    const scroll = document.getElementById('qScroll');
    scroll.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const r = await req('get_questions', 'GET', null, { topic_id: topicId });
    if (!r.success) {
        scroll.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Failed to load questions. Check your connection and try again.</p></div>';
        return;
    }
    allQuestionsCache[topicId] = r.data;
    renderQuestions(allQuestionsCache[topicId], topicId);
    updateTopicProgress(topicId);
    renderTopics();
}

function isRichHtml(str) {
    return /<(p|ul|ol|li|strong|em|h[123]|blockquote|br|pre)[^>]*>/i.test(str);
}

function splitIntoSentences(text) {
    const result = [];
    let last = 0;
    const re = /[.!?]+(?=\s|$)/g;
    let m;
    while ((m = re.exec(text))) {
        const end = m.index + m[0].length;
        result.push(text.slice(last, end));
        last = end;
    }
    if (last < text.length) result.push(text.slice(last));
    return result;
}

function wrapTextNodeSentences(node) {
    const text = node.nodeValue;
    if (!text || !text.trim() || !node.parentNode) return;
    const frag = document.createDocumentFragment();
    splitIntoSentences(text).forEach(part => {
        if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
        const span = document.createElement('span');
        span.className = 'sentence-hl';
        span.textContent = part;
        frag.appendChild(span);
    });
    node.parentNode.replaceChild(frag, node);
}

function wrapSentencesInNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return wrapTextNodeSentences(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (['PRE', 'CODE', 'SCRIPT', 'STYLE'].includes(node.tagName) || node.classList.contains('sentence-hl')) return;
    Array.from(node.childNodes).forEach(wrapSentencesInNode);
}

function enhanceReadableSections(root) {
    root.querySelectorAll('.q-answer, .q-desc, .q-point').forEach(c => Array.from(c.childNodes).forEach(wrapSentencesInNode));
}

const isBlankParagraph = p => (p.textContent || '').replace(/[\s\u00A0]/g, '').length === 0;
const dashBulletMatch = p => (p.textContent || '').match(/^([\u00A0]*)-\s*(.*)$/s);

function normalizeRichAnswer(el) {
    const children = Array.from(el.children);
    let i = 0;
    while (i < children.length) {
        const node = children[i];
        if (node.tagName !== 'P') { i++; continue; }
        if (isBlankParagraph(node)) { node.remove(); i++; continue; }
        if (!dashBulletMatch(node)) { i++; continue; }
        let j = i;
        const items = [];
        while (j < children.length) {
            const n = children[j];
            if (n.tagName !== 'P') break;
            const m = dashBulletMatch(n);
            if (!m) break;
            items.push({ level: m[1].length, html: n.innerHTML.replace(/^(?:&nbsp;|\u00A0)*-\s*/, '') });
            j++;
        }
        const ul = document.createElement('ul');
        ul.className = 'q-answer-list';
        let top = null;
        items.forEach(it => {
            const li = document.createElement('li');
            li.innerHTML = it.html;
            if (it.level > 0 && top) {
                let sub = top.querySelector(':scope > ul.q-answer-sublist');
                if (!sub) { sub = document.createElement('ul'); sub.className = 'q-answer-sublist'; top.appendChild(sub); }
                sub.appendChild(li);
            } else {
                ul.appendChild(li);
                top = li;
            }
        });
        el.insertBefore(ul, children[i]);
        for (let k = i; k < j; k++) children[k].remove();
        i = j;
    }
}

function renderQuestions(questions, topicId) {
    const scroll = document.getElementById('qScroll');
    let filtered = activeFilter === 'all' ? questions : questions.filter(q => q.difficulty === activeFilter);
    if (activeStatusFilter !== 'all') filtered = filtered.filter(q => statusOf(q) === activeStatusFilter);

    if (!filtered.length) {
        scroll.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No questions match this filter. Try another one.</p></div>';
        return;
    }

    const tid = topicId || activeTopic?.id;
    const savedOpen = getOpen(tid);
    const openId = filtered.some(q => String(q.id) === savedOpen) ? savedOpen : null;
    const savedScroll = ls.get(K.scroll + '_' + tid);

    setPanelH();
    scroll.innerHTML = filtered.map((q, i) => buildCard(q, i + 1, String(q.id) === openId)).join('');
    scroll.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    scroll.querySelectorAll('.q-answer.rich-answer').forEach(normalizeRichAnswer);
    enhanceReadableSections(scroll);
    scroll.querySelectorAll('.q-card.q-enter').forEach(c => c.addEventListener('animationend', () => c.classList.remove('q-enter'), { once: true }));

    requestAnimationFrame(() => {
        if (openId) {
            const card = document.getElementById('qcard-' + openId);
            if (card) {
                scroll.style.scrollBehavior = 'auto';
                scroll.scrollTop = Math.max(0, card.offsetTop - 12);
                scroll.style.scrollBehavior = '';
            }
            startTimer(openId);
        } else if (savedScroll) {
            scroll.style.scrollBehavior = 'auto';
            scroll.scrollTop = parseInt(savedScroll);
            scroll.style.scrollBehavior = '';
        }
    });
}

function buildCard(q, num, isOpen) {
    const lang = q.language || 'python';
    const hlLang = lang === 'text' ? 'plaintext' : lang;
    const status = statusOf(q);
    const meta = STATUS_META[status];
    const diff = esc(q.difficulty);

    let answerHtml = '';
    if (q.answer) {
        if (isRichHtml(q.answer)) {
            answerHtml = `<div class="q-answer rich-answer">${q.answer}</div>`;
        } else {
            const rendered = q.answer.split(/\n\n+/).filter(p => p.trim()).map(para => {
                const t = para.trim();
                if (t.startsWith('```') || /^(def |class |import |from |SELECT |INSERT |UPDATE |function |<\?php)/.test(t)) {
                    return `<pre class="q-answer-code">${esc(t.replace(/^```\w*\n?/, '').replace(/```$/, '').trim())}</pre>`;
                }
                return `<p class="q-answer-para">${esc(t).replace(/\n/g, '<br>')}</p>`;
            }).join('');
            answerHtml = `<div class="q-answer">${rendered}</div>`;
        }
    }

    const mainHtml = (q.answer ? `<section><div class="q-section-label"><i class="bi bi-chat-square-text"></i> Answer</div>${answerHtml}</section>` : '')
        + (q.description ? `<section><div class="q-section-label"><i class="bi bi-card-text"></i> Description</div><div class="q-desc">${esc(q.description)}</div></section>` : '');

    const pointsHtml = q.points?.length
        ? `<section><div class="q-section-label"><i class="bi bi-lightbulb"></i> Key points</div><div class="q-points">${q.points.map(p => `<div class="q-point">${esc(p)}</div>`).join('')}</div></section>`
        : '';

    const codeHtml = q.code_example
        ? `<section><div class="q-section-label"><i class="bi bi-code-slash"></i> Example code</div>
            <div class="code-block">
                <div class="code-header"><span class="code-lang">${esc(LANG_LABEL[lang] || lang)}</span><button class="copy-btn" onclick="copyCode(this)"><i class="bi bi-clipboard"></i> Copy</button></div>
                <pre><code class="language-${hlLang}">${esc(q.code_example)}</code></pre>
            </div></section>`
        : '';

    const side = pointsHtml + codeHtml;
    const reads = getReads(q.id), sets = getSets(q.id);

    return `
    <article class="q-card q-enter st-${status}${isOpen ? ' open' : ''}" id="qcard-${q.id}" style="--i:${Math.min(num, 10)}">
        <header class="q-head" onclick="toggleCard(${q.id})">
            <span class="q-num">${num}</span>
            <h3 class="q-text">${esc(q.question)}</h3>
            <div class="q-badges">
                <span class="mini-badge sets${sets ? '' : ' is-zero'}" data-b="${q.id}" title="Completed sets"><i class="bi bi-arrow-repeat"></i><b>${sets}</b></span>
                <span class="mini-badge read${reads ? '' : ' is-zero'}" data-b="${q.id}" title="Times opened"><i class="bi bi-eye"></i><b>${reads}</b></span>
                <button class="status-btn ${meta.cls}" data-qid="${q.id}" data-status="${status}" onclick="cycleStatus(${q.id},'${status}',event)" title="Mark as ${STATUS_CYCLE[status]}">
                    <i class="bi ${meta.icon}"></i><span>${meta.label}</span>
                </button>
                <span class="badge-diff ${diff}">${diff}</span>
                <i class="bi bi-chevron-down q-toggle"></i>
            </div>
        </header>
        <div class="q-body">
            <div class="tracker" id="trk-${q.id}">
                <div class="tk"><i class="bi bi-stopwatch"></i><div><b data-t="session">0:00</b><small data-t="est"></small></div><div class="tk-bar"><span data-t="bar"></span></div></div>
                <div class="tk"><i class="bi bi-hourglass-split"></i><div><b data-t="total">0:00</b><small>total time on this</small></div></div>
                <div class="tk"><i class="bi bi-arrow-repeat"></i><div><b data-t="sets">0</b><small data-t="level"></small></div><button class="set-btn" onclick="completeSet(${q.id},event)">+1 Set</button></div>
                <div class="tk"><i class="bi bi-eye"></i><div><b data-t="opens">0</b><small data-t="last"></small></div></div>
            </div>
            <div class="q-grid${side ? '' : ' no-side'}">
                <div class="q-main">${mainHtml}</div>
                ${side ? `<aside class="q-side">${side}</aside>` : ''}
            </div>
            <footer class="q-foot">
                <button class="status-btn ${meta.cls} status-btn-foot" data-qid="${q.id}" data-status="${status}" onclick="cycleStatus(${q.id},'${status}',event)" title="Mark as ${STATUS_CYCLE[status]}">
                    <i class="bi ${meta.icon}"></i><span>${meta.label}</span>
                </button>
                <button class="btn-sm" onclick="openEditQuestion(${q.id})"><i class="bi bi-pencil"></i> Edit</button>
                <button class="btn-sm danger" onclick="deleteQuestion(${q.id})"><i class="bi bi-trash"></i> Delete</button>
            </footer>
        </div>
    </article>`;
}

function toggleCard(id) {
    const clicked = document.getElementById('qcard-' + id);
    if (!clicked || !activeTopic) return;
    const opening = !clicked.classList.contains('open');
    document.querySelectorAll('.q-card.open').forEach(c => { if (c !== clicked) c.classList.remove('open'); });

    if (!opening) {
        clicked.classList.remove('open');
        saveOpen(activeTopic.id, null);
        stopTimer();
        return;
    }

    setPanelH();
    clicked.classList.add('open');
    clicked.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    saveOpen(activeTopic.id, id);
    bumpRead(id);
    startTimer(id);

    const scrollEl = document.getElementById('qScroll');
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = Math.max(0, clicked.offsetTop - 12);
        scrollEl.scrollTo({ top: target, behavior: 'smooth' });
        ls.set(K.scroll + '_' + activeTopic.id, target);
    }));
}

function filterQuestions(f, el) {
    activeFilter = f;
    syncPills();
    saveState();
    stopTimer();
    if (activeTopic && allQuestionsCache[activeTopic.id]) renderQuestions(allQuestionsCache[activeTopic.id], activeTopic.id);
    else if (activeTopic) loadQuestions(activeTopic.id);
}

function filterByStatus(s, el) {
    activeStatusFilter = s;
    syncPills();
    saveState();
    stopTimer();
    if (activeTopic && allQuestionsCache[activeTopic.id]) renderQuestions(allQuestionsCache[activeTopic.id], activeTopic.id);
    else if (activeTopic) loadQuestions(activeTopic.id);
}

function copyCode(btn) {
    const code = btn.closest('.code-block').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        btn.innerHTML = '<i class="bi bi-check2"></i> Copied';
        setTimeout(() => btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy', 2000);
    });
}

async function searchQuestions() {
    const q = document.getElementById('searchInput').value.trim();
    if (q.length < 2) {
        if (activeTopic) loadQuestions(activeTopic.id);
        return;
    }
    stopTimer();
    const scroll = document.getElementById('qScroll');
    document.getElementById('welcomeScreen').style.display = 'none';
    showTopicChrome(false);
    scroll.style.display = 'block';
    scroll.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const r = await req('search', 'GET', null, { q });
    if (!r.success) {
        scroll.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>${esc(r.message)}</p></div>`;
        return;
    }
    if (!r.data.length) {
        scroll.innerHTML = `<div class="empty-state"><i class="bi bi-search"></i><p>No results for "<b>${esc(q)}</b>". Try a shorter keyword.</p></div>`;
        return;
    }
    scroll.innerHTML = `<div class="search-count">${r.data.length} result(s) for "<b>${esc(q)}</b>"</div>` +
        r.data.map(item => {
            const meta = STATUS_META[statusOf(item)];
            return `<div class="search-result-card" onclick="jumpToTopic(${item.topic_id},${item.id})">
                <div class="search-result-topic">${esc(item.topic_name)}</div>
                <div class="search-result-q">${esc(item.question)}</div>
                <span class="status-badge-inline ${meta.cls}"><i class="bi ${meta.icon}"></i> ${meta.label}</span>
            </div>`;
        }).join('');
}

function jumpToTopic(tid, qid) {
    document.getElementById('searchInput').value = '';
    const t = topics.find(x => x.id == tid);
    if (!t) return;
    if (qid) saveOpen(tid, qid);
    activeFilter = 'all';
    activeStatusFilter = 'all';
    syncPills();
    selectTopic(t, true);
}

function openAddTopic() {
    editingTopic = null;
    document.getElementById('topicModalTitle').textContent = 'Add Topic';
    document.getElementById('topicId').value = '';
    document.getElementById('topicName').value = '';
    document.getElementById('topicIcon').value = 'bi-folder';
    document.getElementById('topicColor').value = '#0d9488';
    document.getElementById('topicOrder').value = '0';
    new bootstrap.Modal(document.getElementById('topicModal')).show();
}

function openEditTopic(e, id) {
    e.stopPropagation();
    const t = topics.find(x => x.id == id);
    if (!t) return;
    editingTopic = t;
    document.getElementById('topicModalTitle').textContent = 'Edit Topic';
    document.getElementById('topicId').value = t.id;
    document.getElementById('topicName').value = t.name;
    document.getElementById('topicIcon').value = t.icon;
    document.getElementById('topicColor').value = t.color;
    document.getElementById('topicOrder').value = t.sort_order;
    new bootstrap.Modal(document.getElementById('topicModal')).show();
}

async function saveTopic() {
    const body = {
        id: document.getElementById('topicId').value || null,
        name: document.getElementById('topicName').value.trim(),
        icon: document.getElementById('topicIcon').value.trim() || 'bi-folder',
        color: document.getElementById('topicColor').value,
        sort_order: document.getElementById('topicOrder').value,
    };
    if (!body.name) {
        Swal.fire({ icon: 'warning', title: 'Name required', confirmButtonColor: '#0d9488' });
        return;
    }
    const r = await req('save_topic', 'POST', body);
    bootstrap.Modal.getInstance(document.getElementById('topicModal'))?.hide();
    if (r.success) {
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        setTimeout(() => location.reload(), 200);
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#0d9488' });
    }
}

async function deleteTopic(e, id) {
    e.stopPropagation();
    const result = await Swal.fire({
        title: 'Delete topic?',
        text: 'All questions in this topic will also be deleted.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, delete',
        confirmButtonColor: '#ee5d54',
        cancelButtonColor: '#adb5bd',
    });
    if (!result.isConfirmed) return;
    const r = await req('delete_topic', 'POST', { id });
    if (r.success) {
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        saveOpen(id, null);
        if (activeTopic?.id == id) {
            stopTimer();
            activeTopic = null;
            ls.del(K.topic);
            showTopicChrome(false);
            document.getElementById('qScroll').style.display = 'none';
            document.getElementById('welcomeScreen').style.display = 'flex';
            document.getElementById('topAddQBtn').style.display = 'none';
            document.getElementById('mbnAddQ').style.display = 'none';
        }
        loadTopics();
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#0d9488' });
    }
}

function initQuillEditor() {
    if (quillAnswer) { quillAnswer.setContents([]); return; }
    quillAnswer = new Quill('#quillAnswerEditor', {
        theme: 'snow',
        placeholder: 'Write a clear, concise answer…',
        modules: {
            toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                [{ indent: '-1' }, { indent: '+1' }],
                ['clean']
            ]
        }
    });
}

function setQuillContent(html) {
    if (!quillAnswer) return;
    if (html && html.trim()) quillAnswer.root.innerHTML = html;
    else quillAnswer.setContents([]);
}

function getQuillContent() {
    if (!quillAnswer) return '';
    const html = quillAnswer.root.innerHTML;
    return html === '<p><br></p>' || !html.trim() ? '' : html;
}

function initCodeEditor() {
    const wrapper = document.getElementById('codeEditorWrapper');
    wrapper.innerHTML = '';
    codeEditor = CodeMirror(wrapper, {
        value: document.getElementById('qCode').value || '',
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        extraKeys: { Tab: cm => cm.replaceSelection('    ', 'end') }
    });
}

function updateEditorMode() {
    if (!codeEditor) return;
    const modeMap = { python: 'python', javascript: 'javascript', php: 'php', sql: 'sql', bash: 'shell', java: 'text/x-java', text: null };
    codeEditor.setOption('mode', modeMap[document.getElementById('qLang').value] || null);
}

function openAddQuestion() {
    if (!activeTopic) return;
    editingQuestion = null;
    document.getElementById('qModalTitle').textContent = 'Add Question';
    document.getElementById('qId').value = '';
    document.getElementById('qTopicId').value = activeTopic.id;
    document.getElementById('qQuestion').value = '';
    document.getElementById('qAnswer').value = '';
    document.getElementById('qPoints').value = '';
    document.getElementById('qCode').value = '';
    document.getElementById('qDifficulty').value = 'intermediate';
    document.getElementById('qLang').value = 'python';
    document.getElementById('qOrder').value = '0';
    const modalEl = document.getElementById('qModal');
    modalEl.addEventListener('shown.bs.modal', () => {
        initQuillEditor();
        setQuillContent('');
        initCodeEditor();
    }, { once: true });
    new bootstrap.Modal(modalEl).show();
}

async function openEditQuestion(id) {
    const r = await req('get_question', 'GET', null, { id });
    if (!r.success) return;
    const q = r.data;
    editingQuestion = q;
    document.getElementById('qModalTitle').textContent = 'Edit Question';
    document.getElementById('qId').value = q.id;
    document.getElementById('qTopicId').value = q.topic_id;
    document.getElementById('qQuestion').value = q.question;
    document.getElementById('qAnswer').value = q.answer;
    document.getElementById('qDifficulty').value = q.difficulty;
    document.getElementById('qPoints').value = Array.isArray(q.points) ? q.points.join('\n') : '';
    document.getElementById('qCode').value = q.code_example ?? '';
    document.getElementById('qLang').value = q.language ?? 'python';
    document.getElementById('qOrder').value = q.sort_order;
    const modalEl = document.getElementById('qModal');
    modalEl.addEventListener('shown.bs.modal', () => {
        initQuillEditor();
        setQuillContent(q.answer ?? '');
        initCodeEditor();
        if (codeEditor) codeEditor.setValue(q.code_example ?? '');
        updateEditorMode();
    }, { once: true });
    new bootstrap.Modal(modalEl).show();
}

async function saveQuestion() {
    const codeVal = codeEditor ? codeEditor.getValue() : document.getElementById('qCode').value;
    const body = {
        id: document.getElementById('qId').value || null,
        topic_id: document.getElementById('qTopicId').value,
        question: document.getElementById('qQuestion').value.trim(),
        answer: getQuillContent(),
        difficulty: document.getElementById('qDifficulty').value,
        language: document.getElementById('qLang').value,
        points: document.getElementById('qPoints').value.trim(),
        code_example: codeVal.trim(),
        sort_order: document.getElementById('qOrder').value,
    };
    if (!body.question || !body.answer) {
        Swal.fire({ icon: 'warning', title: 'Question and answer are required', confirmButtonColor: '#0d9488' });
        return;
    }
    const r = await req('save_question', 'POST', body);
    bootstrap.Modal.getInstance(document.getElementById('qModal'))?.hide();
    if (r.success) {
        if (body.id && activeTopic) saveOpen(activeTopic.id, body.id);
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        setTimeout(() => location.reload(), 200);
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#0d9488' });
    }
}

async function deleteQuestion(id) {
    const result = await Swal.fire({
        title: 'Delete question?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#ee5d54',
        cancelButtonColor: '#adb5bd',
    });
    if (!result.isConfirmed) return;
    const r = await req('delete_question', 'POST', { id });
    if (r.success) {
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        if (activeTopic && getOpen(activeTopic.id) === String(id)) { saveOpen(activeTopic.id, null); stopTimer(); }
        loadTopics();
        if (activeTopic) {
            delete allQuestionsCache[activeTopic.id];
            loadQuestions(activeTopic.id);
        }
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#0d9488' });
    }
}

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const v = document.getElementById('searchInput').value.trim();
    if (!v) {
        showTopicChrome(!!activeTopic);
        if (activeTopic) loadQuestions(activeTopic.id);
        else {
            document.getElementById('qScroll').style.display = 'none';
            document.getElementById('welcomeScreen').style.display = 'flex';
        }
        return;
    }
    searchDebounce = setTimeout(searchQuestions, 380);
});

document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
    if (t && t.closest && t.closest('.CodeMirror')) return;
    e.preventDefault();
    document.getElementById('searchInput').focus();
});

document.getElementById('qScroll').addEventListener('scroll', e => {
    if (activeTopic) ls.set(K.scroll + '_' + activeTopic.id, e.target.scrollTop);
}, { passive: true });

window.addEventListener('resize', setPanelH);

document.addEventListener('DOMContentLoaded', () => {
    purgeLegacyLocalStatuses();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
    setPanelH();
    paintStudy();
    loadTopics();
});