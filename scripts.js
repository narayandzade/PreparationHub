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

const LS_TOPIC         = 'prep_active_topic';
const LS_FILTER        = 'prep_active_filter';
const LS_STATUS_FILTER = 'prep_status_filter';
const LS_SCROLL        = 'prep_scroll_pos';
const LS_STATUS_PREFIX = 'prep_status_';
const LS_OPEN_CARD     = 'prep_open_card';

async function req(action, method = 'GET', body = null, params = {}) {
    const url = new URL(API, location.href);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
}

function getLocalStatus(questionId) {
    return localStorage.getItem(LS_STATUS_PREFIX + questionId) || null;
}

function setLocalStatus(questionId, status) {
    localStorage.setItem(LS_STATUS_PREFIX + questionId, status);
}

function applyLocalStatuses(questions) {
    return questions.map(q => {
        const local = getLocalStatus(q.id);
        return local ? { ...q, status: local } : q;
    });
}

const STATUS_CYCLE = { new: 'reading', reading: 'done', done: 'new' };
const STATUS_META = {
    new:     { label: 'New',     icon: 'bi-circle',            cls: 'status-new' },
    reading: { label: 'Reading', icon: 'bi-book-half',         cls: 'status-reading' },
    done:    { label: 'Done',    icon: 'bi-check-circle-fill', cls: 'status-done' },
};

async function cycleStatus(questionId, currentStatus, event) {
    event.stopPropagation();
    const next = STATUS_CYCLE[currentStatus] || 'new';
    const btn = document.querySelector(`.status-btn[data-qid="${questionId}"]`);
    if (!btn) return;

    btn.classList.add('status-animating');

    setLocalStatus(questionId, next);
    if (allQuestionsCache[activeTopic?.id]) {
        const q = allQuestionsCache[activeTopic.id].find(x => x.id == questionId);
        if (q) q.status = next;
    }
    applyStatusToBtn(btn, questionId, next);

    try {
        await req('update_status', 'POST', { id: questionId, status: next });
    } catch (_) {}

    setTimeout(() => btn.classList.remove('status-animating'), 420);

    const card = document.getElementById('qcard-' + questionId);
    if (card) {
        card.classList.add('status-flash-' + next);
        setTimeout(() => card.classList.remove('status-flash-new', 'status-flash-reading', 'status-flash-done'), 700);
    }

    updateTopicProgress(activeTopic?.id);

    if (activeStatusFilter !== 'all' && next !== activeStatusFilter) {
        if (card) {
            card.style.transition = 'opacity .35s, transform .35s';
            card.style.opacity = '0';
            card.style.transform = 'translateX(18px)';
            setTimeout(() => {
                card.remove();
                checkEmptyState();
            }, 360);
        }
    }
}

function applyStatusToBtn(btn, questionId, status) {
    const meta = STATUS_META[status] || STATUS_META.new;
    btn.dataset.status = status;
    btn.className = `status-btn ${meta.cls}`;
    btn.innerHTML = `<i class="bi ${meta.icon}"></i><span>${meta.label}</span>`;
    btn.title = `Mark as ${STATUS_CYCLE[status]}`;
    btn.setAttribute('onclick', `cycleStatus(${questionId},'${status}',event)`);

    const footBtn = document.querySelector(`.status-btn[data-qid="foot-${questionId}"]`);
    if (footBtn) {
        footBtn.dataset.status = status;
        footBtn.className = `status-btn ${meta.cls} status-btn-foot`;
        footBtn.innerHTML = `<i class="bi ${meta.icon}"></i><span>${meta.label}</span>`;
        footBtn.title = `Mark as ${STATUS_CYCLE[status]}`;
        footBtn.setAttribute('onclick', `cycleStatus(${questionId},'${status}',event)`);
    }
}

function checkEmptyState() {
    const scroll = document.getElementById('qScroll');
    const cards = scroll.querySelectorAll('.q-card');
    if (!cards.length) {
        scroll.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No questions match this filter.</p></div>';
    }
}

function updateTopicProgress(topicId) {
    if (!topicId || !allQuestionsCache[topicId]) return;
    const qs = allQuestionsCache[topicId];
    const total = qs.length;
    if (!total) return;
    const done = qs.filter(q => (getLocalStatus(q.id) || q.status) === 'done').length;
    const pct = Math.round((done / total) * 100);
    const bar = document.querySelector(`.topic-progress-bar[data-tid="${topicId}"]`);
    const lbl = document.querySelector(`.topic-progress-lbl[data-tid="${topicId}"]`);
    if (bar) {
        bar.style.width = pct + '%';
        bar.className = `topic-progress-bar${pct === 100 ? ' complete' : ''}`;
        bar.dataset.tid = topicId;
    }
    if (lbl) {
        lbl.textContent = `${done}/${total}`;
        lbl.dataset.tid = topicId;
    }
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
        if (r.success) allQuestionsCache[topicId] = applyLocalStatuses(r.data);
    } catch (_) {}
}

function saveState() {
    if (activeTopic) localStorage.setItem(LS_TOPIC, activeTopic.id);
    localStorage.setItem(LS_FILTER, activeFilter);
    localStorage.setItem(LS_STATUS_FILTER, activeStatusFilter);
}

function restoreState() {
    const savedTopicId = localStorage.getItem(LS_TOPIC);
    const savedFilter = localStorage.getItem(LS_FILTER) || 'all';
    const savedStatusFilter = localStorage.getItem(LS_STATUS_FILTER) || 'all';
    if (savedTopicId) {
        const t = topics.find(x => x.id == savedTopicId);
        if (t) {
            activeFilter = savedFilter;
            activeStatusFilter = savedStatusFilter;
            selectTopic(t, true);
            const pill = document.querySelector(`.diff-pill[data-f="${savedFilter}"]`);
            if (pill) {
                document.querySelectorAll('.diff-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            }
            const spill = document.querySelector(`.status-pill[data-s="${savedStatusFilter}"]`);
            if (spill) {
                document.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
                spill.classList.add('active');
            }
        }
    }
}

function renderTopics() {
    const list = document.getElementById('topicList');
    list.innerHTML = '';
    topics.forEach(t => {
        const cached = allQuestionsCache[t.id];
        const total = parseInt(t.question_count) || 0;
        const done = cached ? cached.filter(q => (getLocalStatus(q.id) || q.status) === 'done').length : 0;
        const pct = total ? Math.round((done / total) * 100) : 0;

        const el = document.createElement('div');
        el.className = 'topic-item' + (activeTopic?.id == t.id ? ' active' : '');
        el.dataset.id = t.id;
        el.innerHTML = `
            <div class="topic-icon" style="background:${t.color}18;color:${t.color}">
                <i class="bi ${t.icon}"></i>
            </div>
            <div class="topic-meta">
                <span class="topic-name">${esc(t.name)}</span>
                <div class="topic-progress-track">
                    <div class="topic-progress-bar${pct === 100 ? ' complete' : ''}" data-tid="${t.id}" style="width:${pct}%"></div>
                </div>
            </div>
            <div class="topic-right">
                <span class="topic-count">${t.question_count}</span>
                <span class="topic-progress-lbl" data-tid="${t.id}">${done ? done + '/' + total : ''}</span>
            </div>
            <div class="topic-actions">
                <button onclick="openEditTopic(event,${t.id})" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="del-btn" onclick="deleteTopic(event,${t.id})" title="Delete"><i class="bi bi-trash"></i></button>
            </div>`;
        el.addEventListener('click', () => selectTopic(t));
        list.appendChild(el);
    });
}

function selectTopic(t, skipSave) {
    const prevTopicId = activeTopic?.id;
    activeTopic = t;
    if (!skipSave) {
        activeFilter = 'all';
        activeStatusFilter = 'all';
        localStorage.removeItem(LS_OPEN_CARD);
        if (prevTopicId && prevTopicId !== t.id) localStorage.removeItem(LS_SCROLL + '_' + prevTopicId);
        document.querySelectorAll('.diff-pill').forEach(p => p.classList.remove('active'));
        document.querySelector('.diff-pill[data-f="all"]')?.classList.add('active');
        document.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
        document.querySelector('.status-pill[data-s="all"]')?.classList.add('active');
    }
    renderTopics();
    loadQuestions(t.id);
    document.getElementById('mainTitle').textContent = t.name;
    document.getElementById('mainIcon').innerHTML = `<i class="bi ${t.icon}" style="color:${t.color}"></i>`;
    document.getElementById('addQBtn').style.display = 'inline-flex';
    document.getElementById('topAddQBtn').style.display = 'inline-flex';
    document.getElementById('mbnAddQ').style.display = 'flex';
    document.getElementById('mainHeader').style.display = 'block';
    document.getElementById('filterRow').style.display = 'flex';
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('qScroll').style.display = 'block';
    saveState();
}

async function loadQuestions(topicId) {
    const scroll = document.getElementById('qScroll');
    scroll.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const r = await req('get_questions', 'GET', null, { topic_id: topicId });
    if (!r.success) {
        scroll.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Failed to load</p></div>';
        return;
    }
    allQuestionsCache[topicId] = applyLocalStatuses(r.data);
    renderQuestions(allQuestionsCache[topicId], topicId);
    updateTopicProgress(topicId);
    renderTopics();
}

function isRichHtml(str) {
    return /<(p|ul|ol|li|strong|em|h[123]|blockquote|br)[^>]*>/i.test(str);
}

function splitIntoSentences(text) {
    const result = [];
    let lastIndex = 0;
    const re = /[.!?]+(?=\s|$)/g;
    let m;
    while ((m = re.exec(text))) {
        const end = m.index + m[0].length;
        result.push(text.slice(lastIndex, end));
        lastIndex = end;
    }
    if (lastIndex < text.length) result.push(text.slice(lastIndex));
    return result;
}

function wrapTextNodeSentences(node) {
    const text = node.nodeValue;
    if (!text || !text.trim()) return;
    const parent = node.parentNode;
    if (!parent) return;
    const parts = splitIntoSentences(text);
    if (!parts.length) return;
    const frag = document.createDocumentFragment();
    parts.forEach(part => {
        if (!part.trim()) {
            frag.appendChild(document.createTextNode(part));
            return;
        }
        const span = document.createElement('span');
        span.className = 'sentence-hl';
        span.textContent = part;
        frag.appendChild(span);
    });
    parent.replaceChild(frag, node);
}

function wrapSentencesInNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        wrapTextNodeSentences(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'PRE' || tag === 'CODE' || tag === 'SCRIPT' || tag === 'STYLE' || node.classList.contains('sentence-hl')) return;
        Array.from(node.childNodes).forEach(wrapSentencesInNode);
    }
}

function enhanceSentences(container) {
    if (!container) return;
    Array.from(container.childNodes).forEach(wrapSentencesInNode);
}

function enhanceReadableSections(root) {
    root.querySelectorAll('.q-answer, .q-desc, .q-point').forEach(enhanceSentences);
}

function isBlankParagraph(p) {
    const text = (p.textContent || '').replace(/[\s\u00A0]/g, '');
    return text.length === 0;
}

function dashBulletMatch(p) {
    const text = p.textContent || '';
    return text.match(/^([\u00A0]*)-\s*(.*)$/s);
}

function normalizeRichAnswer(el) {
    const children = Array.from(el.children);
    let i = 0;
    while (i < children.length) {
        const node = children[i];
        if (node.tagName !== 'P') { i++; continue; }
        if (isBlankParagraph(node)) {
            node.remove();
            i++;
            continue;
        }
        const firstMatch = dashBulletMatch(node);
        if (!firstMatch) { i++; continue; }

        let j = i;
        const items = [];
        while (j < children.length) {
            const n = children[j];
            if (n.tagName !== 'P') break;
            const m = dashBulletMatch(n);
            if (!m) break;
            const strippedLead = m[1].length;
            const html = n.innerHTML.replace(/^(?:&nbsp;|\u00A0)*-\s*/, '');
            items.push({ level: strippedLead, html });
            j++;
        }

        const ul = document.createElement('ul');
        ul.className = 'q-answer-list';
        let currentTopLi = null;
        items.forEach(it => {
            const li = document.createElement('li');
            li.innerHTML = it.html;
            if (it.level > 0 && currentTopLi) {
                let subUl = currentTopLi.querySelector(':scope > ul.q-answer-sublist');
                if (!subUl) {
                    subUl = document.createElement('ul');
                    subUl.className = 'q-answer-sublist';
                    currentTopLi.appendChild(subUl);
                }
                subUl.appendChild(li);
            } else {
                ul.appendChild(li);
                currentTopLi = li;
            }
        });

        el.insertBefore(ul, children[i]);
        for (let k = i; k < j; k++) children[k].remove();
        i = j;
    }
}

function normalizeAnswerFormatting(root) {
    root.querySelectorAll('.q-answer.rich-answer').forEach(normalizeRichAnswer);
}

function renderQuestions(questions, topicId) {
    const scroll = document.getElementById('qScroll');
    let filtered = activeFilter === 'all' ? questions : questions.filter(q => q.difficulty === activeFilter);
    if (activeStatusFilter !== 'all') filtered = filtered.filter(q => (getLocalStatus(q.id) || q.status) === activeStatusFilter);

    if (!filtered.length) {
        scroll.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No questions found for this filter.</p></div>';
        return;
    }

    const resolvedTopicId = topicId || activeTopic?.id;
    const savedOpenId = localStorage.getItem(LS_OPEN_CARD);
    const savedScroll = resolvedTopicId ? localStorage.getItem(LS_SCROLL + '_' + resolvedTopicId) : null;

    scroll.innerHTML = filtered.map((q, i) => buildCard(q, i + 1, String(q.id) === savedOpenId)).join('');
    document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    normalizeAnswerFormatting(scroll);
    enhanceReadableSections(scroll);

    scroll.addEventListener('scroll', () => {
        if (activeTopic) localStorage.setItem(LS_SCROLL + '_' + activeTopic.id, scroll.scrollTop);
    }, { passive: true });

    if (savedOpenId) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const openCard = document.getElementById('qcard-' + savedOpenId);
                    if (openCard) {
                        const target = Math.max(0, openCard.offsetTop - 220);
                        scroll.scrollTo({ top: target, behavior: 'smooth' });
                        if (activeTopic) {
                            localStorage.setItem(LS_SCROLL + '_' + activeTopic.id, target);
                        }
                    }
                }, 120);
            });
        });
    } else if (savedScroll) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scroll.scrollTop = parseInt(savedScroll);
            });
        });
    }
}

function buildCard(q, num, isOpen = false) {
    const langLabel = { python: 'Python', javascript: 'JavaScript', php: 'PHP', sql: 'SQL', bash: 'Bash', java: 'Java', text: 'Text' };
    const lang = q.language || 'python';
    const hlLang = lang === 'bash' ? 'bash' : lang === 'text' ? 'plaintext' : lang;
    const status = getLocalStatus(q.id) || q.status || 'new';
    const meta = STATUS_META[status] || STATUS_META.new;

    let answerHtml = '';
    if (q.answer) {
        if (isRichHtml(q.answer)) {
            answerHtml = `<div class="q-answer rich-answer">${q.answer}</div>`;
        } else {
            const paragraphs = q.answer.split(/\n\n+/).filter(p => p.trim());
            const rendered = paragraphs.map(para => {
                const trimmed = para.trim();
                if (trimmed.startsWith('```') || /^(def |class |import |from |SELECT |INSERT |UPDATE |function |<\?php)/.test(trimmed)) {
                    return `<div class="inline-code-wrap"><pre class="q-answer-code">${esc(trimmed.replace(/^```\w*\n?/, '').replace(/```$/, '').trim())}</pre></div>`;
                }
                return `<p class="q-answer-para">${esc(trimmed).replace(/\n/g, '<br>')}</p>`;
            }).join('');
            answerHtml = `<div class="q-answer">${rendered}</div>`;
        }
    }

    const pointsHtml = q.points?.length
        ? `<div class="q-section">
            <div class="q-section-label">Key Points</div>
            <div class="q-points">${q.points.map(p => `<div class="q-point">${esc(p)}</div>`).join('')}</div>
           </div>`
        : '';

    const codeHtml = q.code_example
        ? `<div class="q-section">
            <div class="q-section-label">Example Code</div>
            <div class="code-block">
                <div class="code-header">
                    <span class="code-lang">${esc(langLabel[lang] || lang)}</span>
                    <button class="copy-btn" onclick="copyCode(this)"><i class="bi bi-clipboard"></i> Copy</button>
                </div>
                <pre><code class="language-${hlLang}">${esc(q.code_example)}</code></pre>
            </div>
           </div>`
        : '';

    const descHtml = q.description
        ? `<div class="q-section"><div class="q-section-label">Description</div><div class="q-desc">${esc(q.description)}</div></div>`
        : '';

    return `
    <div class="q-card status-border-${status}${isOpen ? ' open' : ''}" id="qcard-${q.id}">
        <div class="q-card-head" onclick="toggleCard(${q.id})">
            <div class="q-num">${num}</div>
            <div class="q-text">${esc(q.question)}</div>
            <div class="q-badges">
                <button class="status-btn ${meta.cls}" data-qid="${q.id}" data-status="${status}"
                    onclick="cycleStatus(${q.id},'${status}',event)"
                    title="Mark as ${STATUS_CYCLE[status]}">
                    <i class="bi ${meta.icon}"></i><span>${meta.label}</span>
                </button>
                <span class="badge-diff ${q.difficulty}">${q.difficulty}</span>
                <i class="bi bi-chevron-down q-toggle"></i>
            </div>
        </div>
        <div class="q-card-body">
            ${q.answer ? `<div class="q-section"><div class="q-section-label">Answer</div>${answerHtml}</div>` : ''}
            ${descHtml}
            ${pointsHtml}
            ${codeHtml}
            <div class="q-card-foot">
                <button class="status-btn ${meta.cls} status-btn-foot" data-qid="foot-${q.id}" data-status="${status}"
                    onclick="cycleStatus(${q.id},'${status}',event)"
                    title="Mark as ${STATUS_CYCLE[status]}">
                    <i class="bi ${meta.icon}"></i><span>${meta.label}</span>
                </button>
                <button class="btn-sm" onclick="openEditQuestion(${q.id})"><i class="bi bi-pencil"></i> Edit</button>
                <button class="btn-sm danger" onclick="deleteQuestion(${q.id})"><i class="bi bi-trash"></i> Delete</button>
            </div>
        </div>
    </div>`;
}

function toggleCard(id) {
    const clicked = document.getElementById('qcard-' + id);
    if (!clicked) return;

    const isOpening = !clicked.classList.contains('open');

    document.querySelectorAll('.q-card.open').forEach(card => {
        if (card !== clicked) card.classList.remove('open');
    });

    if (isOpening) {
        clicked.classList.add('open');
        clicked.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
        localStorage.setItem(LS_OPEN_CARD, String(id));

        const scrollEl = document.getElementById('qScroll');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const target = Math.max(0, clicked.offsetTop - 220);
                scrollEl.scrollTo({ top: target, behavior: 'smooth' });
                if (activeTopic) {
                    localStorage.setItem(LS_SCROLL + '_' + activeTopic.id, target);
                }
            });
        });
    } else {
        clicked.classList.remove('open');
        localStorage.removeItem(LS_OPEN_CARD);
    }
}

function filterQuestions(f, el) {
    activeFilter = f;
    document.querySelectorAll('.diff-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    saveState();
    if (activeTopic && allQuestionsCache[activeTopic.id]) {
        renderQuestions(allQuestionsCache[activeTopic.id], activeTopic.id);
    } else if (activeTopic) {
        loadQuestions(activeTopic.id);
    }
}

function filterByStatus(s, el) {
    activeStatusFilter = s;
    document.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    saveState();
    if (activeTopic && allQuestionsCache[activeTopic.id]) {
        renderQuestions(allQuestionsCache[activeTopic.id], activeTopic.id);
    } else if (activeTopic) {
        loadQuestions(activeTopic.id);
    }
}

function copyCode(btn) {
    const code = btn.closest('.code-block').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        btn.innerHTML = '<i class="bi bi-check2"></i> Copied!';
        setTimeout(() => btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy', 2000);
    });
}

async function searchQuestions() {
    const q = document.getElementById('searchInput').value.trim();
    if (q.length < 2) {
        if (activeTopic) loadQuestions(activeTopic.id);
        return;
    }
    const scroll = document.getElementById('qScroll');
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('filterRow').style.display = 'none';
    document.getElementById('qScroll').style.display = 'block';
    scroll.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const r = await req('search', 'GET', null, { q });
    if (!r.success) {
        scroll.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>${r.message}</p></div>`;
        return;
    }
    if (!r.data.length) {
        scroll.innerHTML = `<div class="empty-state"><i class="bi bi-search"></i><p>No results for "<b>${esc(q)}</b>"</p></div>`;
        return;
    }
    scroll.innerHTML = `<div style="padding:0 0 14px;font-size:.8rem;color:var(--muted);font-weight:600">${r.data.length} result(s) for "<b style="color:var(--text)">${esc(q)}</b>"</div>` +
        r.data.map(item => {
            const status = getLocalStatus(item.id) || item.status || 'new';
            const meta = STATUS_META[status];
            return `<div class="search-result-card" onclick="jumpToTopic(${item.topic_id})">
                <div class="search-result-topic">${esc(item.topic_name)}</div>
                <div class="search-result-q">${esc(item.question)}</div>
                <span class="status-badge-inline ${meta.cls}"><i class="bi ${meta.icon}"></i> ${meta.label}</span>
            </div>`;
        }).join('');
}

function jumpToTopic(tid) {
    document.getElementById('searchInput').value = '';
    const t = topics.find(x => x.id == tid);
    if (t) selectTopic(t);
}

function openAddTopic() {
    editingTopic = null;
    document.getElementById('topicModalTitle').textContent = 'Add Topic';
    document.getElementById('topicId').value = '';
    document.getElementById('topicName').value = '';
    document.getElementById('topicIcon').value = 'bi-folder';
    document.getElementById('topicColor').value = '#2c3fce';
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
        Swal.fire({ icon: 'warning', title: 'Name required', confirmButtonColor: '#5b5bf5' });
        return;
    }
    const r = await req('save_topic', 'POST', body);
    bootstrap.Modal.getInstance(document.getElementById('topicModal'))?.hide();
    if (r.success) {
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        setTimeout(() => {
            location.reload();
        }, 200);
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#5b5bf5' });
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
        confirmButtonColor: '#e15b4f',
        cancelButtonColor: '#adb5bd',
    });
    if (!result.isConfirmed) return;
    const r = await req('delete_topic', 'POST', { id });
    if (r.success) {
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        if (activeTopic?.id == id) {
            activeTopic = null;
            localStorage.removeItem(LS_TOPIC);
            localStorage.removeItem(LS_OPEN_CARD);
            document.getElementById('mainHeader').style.display = 'none';
            document.getElementById('filterRow').style.display = 'none';
            document.getElementById('qScroll').style.display = 'none';
            document.getElementById('welcomeScreen').style.display = 'flex';
            document.getElementById('addQBtn').style.display = 'none';
            document.getElementById('topAddQBtn').style.display = 'none';
            document.getElementById('mbnAddQ').style.display = 'none';
        }
        loadTopics();
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#5b5bf5' });
    }
}

function initQuillEditor() {
    if (quillAnswer) {
        quillAnswer.setContents([]);
        return;
    }
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
    if (html && html.trim()) {
        quillAnswer.root.innerHTML = html;
    } else {
        quillAnswer.setContents([]);
    }
}

function getQuillContent() {
    if (!quillAnswer) return '';
    const html = quillAnswer.root.innerHTML;
    if (html === '<p><br></p>' || !html.trim()) return '';
    return html;
}

function initCodeEditor() {
    const wrapper = document.getElementById('codeEditorWrapper');
    wrapper.innerHTML = '';
    const ta = document.getElementById('qCode');
    codeEditor = CodeMirror(wrapper, {
        value: ta.value || '',
        mode: 'python',
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        autofocus: false,
        extraKeys: { Tab: cm => cm.replaceSelection('    ', 'end') }
    });
}

function updateEditorMode() {
    if (!codeEditor) return;
    const modeMap = { python: 'python', javascript: 'javascript', php: 'php', sql: 'sql', bash: 'shell', java: 'text/x-java', text: null };
    const lang = document.getElementById('qLang').value;
    codeEditor.setOption('mode', modeMap[lang] || null);
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
    const modal = new bootstrap.Modal(document.getElementById('qModal'));
    modal.show();
    document.getElementById('qModal').addEventListener('shown.bs.modal', () => {
        initQuillEditor();
        setQuillContent('');
        initCodeEditor();
    }, { once: true });
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
    const modal = new bootstrap.Modal(document.getElementById('qModal'));
    modal.show();
    document.getElementById('qModal').addEventListener('shown.bs.modal', () => {
        initQuillEditor();
        setQuillContent(q.answer ?? '');
        initCodeEditor();
        if (codeEditor) codeEditor.setValue(q.code_example ?? '');
        updateEditorMode();
    }, { once: true });
}

async function saveQuestion() {
    const codeVal = codeEditor ? codeEditor.getValue() : document.getElementById('qCode').value;
    const answerVal = getQuillContent();
    const body = {
        id: document.getElementById('qId').value || null,
        topic_id: document.getElementById('qTopicId').value,
        question: document.getElementById('qQuestion').value.trim(),
        answer: answerVal,
        difficulty: document.getElementById('qDifficulty').value,
        language: document.getElementById('qLang').value,
        points: document.getElementById('qPoints').value.trim(),
        code_example: codeVal.trim(),
        sort_order: document.getElementById('qOrder').value,
    };
    if (!body.question || !body.answer) {
        Swal.fire({ icon: 'warning', title: 'Question and answer are required', confirmButtonColor: '#5b5bf5' });
        return;
    }

    const preserveOpenId = body.id ? String(body.id) : null;

    const r = await req('save_question', 'POST', body);
    bootstrap.Modal.getInstance(document.getElementById('qModal'))?.hide();
    if (r.success) {
        if (preserveOpenId) {
            localStorage.setItem(LS_OPEN_CARD, preserveOpenId);
            localStorage.removeItem(LS_SCROLL + '_' + (activeTopic?.id ?? ''));
        }
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        setTimeout(() => {
            location.reload();
        }, 200);
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#5b5bf5' });
    }
}

async function deleteQuestion(id) {
    const result = await Swal.fire({
        title: 'Delete question?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#e15b4f',
        cancelButtonColor: '#adb5bd',
    });
    if (!result.isConfirmed) return;
    const r = await req('delete_question', 'POST', { id });
    if (r.success) {
        Swal.fire({ icon: 'success', title: r.message, timer: 1400, showConfirmButton: false });
        if (localStorage.getItem(LS_OPEN_CARD) === String(id)) {
            localStorage.removeItem(LS_OPEN_CARD);
        }
        loadTopics();
        if (activeTopic) {
            delete allQuestionsCache[activeTopic.id];
            loadQuestions(activeTopic.id);
        }
    } else {
        Swal.fire({ icon: 'error', title: r.message, confirmButtonColor: '#5b5bf5' });
    }
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const v = document.getElementById('searchInput').value.trim();
    if (!v) {
        document.getElementById('mainHeader').style.display = activeTopic ? 'block' : 'none';
        document.getElementById('filterRow').style.display = activeTopic ? 'flex' : 'none';
        if (activeTopic) loadQuestions(activeTopic.id);
        else {
            document.getElementById('qScroll').style.display = 'none';
            document.getElementById('welcomeScreen').style.display = 'flex';
        }
        return;
    }
    searchDebounce = setTimeout(searchQuestions, 380);
});

document.addEventListener('DOMContentLoaded', loadTopics);