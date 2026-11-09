const API_ENDPOINT = 'backend.php';
const READY_SET_TARGET = 3;

const STORAGE_KEYS = {
    activeTopic: 'prep_active_topic',
    difficultyFilter: 'prep_active_filter',
    statusFilter: 'prep_status_filter',
    listScroll: 'prep_scroll_pos_',
    openQuestions: 'prep_open_map',
    theme: 'prep_theme',
    practiceMode: 'prep_practice_mode',
    focusMode: 'prep_focus_mode',
    reads: 'prep_reads_',
    lastRead: 'prep_lastread_',
    sets: 'prep_sets_',
    time: 'prep_time_',
    day: 'prep_day_',
};

const STATUS_NEXT = { new: 'reading', reading: 'done', done: 'new' };

const STATUS_META = {
    new: { label: 'New', icon: 'bi-circle' },
    reading: { label: 'Reading', icon: 'bi-book-half' },
    done: { label: 'Done', icon: 'bi-check-circle-fill' },
};

const LANGUAGE_LABELS = {
    python: 'Python',
    javascript: 'JavaScript',
    php: 'PHP',
    sql: 'SQL',
    bash: 'Bash',
    java: 'Java',
    text: 'Text',
};

const EDITOR_MODES = {
    python: 'python',
    javascript: 'javascript',
    php: 'php',
    sql: 'sql',
    bash: 'shell',
    java: 'text/x-java',
    text: null,
};

const HIGHLIGHT_LANGUAGES = ['python', 'javascript', 'php', 'sql', 'bash', 'java', 'xml', 'css', 'json'];
const CONFETTI_COLORS = ['#e92a7c', '#c9f23a', '#0fb5d9', '#ffd21f', '#6a4cff', '#14b284'];

const state = {
    topics: [],
    activeTopic: null,
    selectedQuestionId: null,
    statusFilter: 'all',
    difficultyFilter: 'all',
    questionCache: {},
    isSearching: false,
    practiceMode: false,
    focusMode: false,
};

const studyTimer = {
    questionId: null,
    intervalId: null,
    sessionSeconds: 0,
    tickCount: 0,
    estimateSeconds: 60,
};

let codeEditor = null;
let answerEditor = null;
let searchTimeout = null;
let deferredInstallPrompt = null;

const $ = id => document.getElementById(id);

const storage = {
    get: key => {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    },
    set: (key, value) => {
        try { localStorage.setItem(key, value); } catch (_) {}
    },
    remove: key => {
        try { localStorage.removeItem(key); } catch (_) {}
    },
};

async function apiRequest(action, method = 'GET', body = null, params = {}) {
    const url = new URL(API_ENDPOINT, location.href);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (_) {
        return { success: false, message: 'Network error. Check your connection and try again.' };
    }
}

function escapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setText(id, value) {
    const element = $(id);
    if (element && element.textContent !== String(value)) element.textContent = value;
}

function showToast(icon, title) {
    Swal.fire({ toast: true, position: 'top-end', icon, title, timer: icon === 'error' ? 2200 : 1800, showConfirmButton: false });
}

function isSplitView() {
    return window.matchMedia('(min-width: 900px)').matches;
}

function highlightCode(text, language) {
    if (!window.hljs) return escapeHtml(text);
    try {
        if (language && language !== 'text' && hljs.getLanguage(language)) {
            return hljs.highlight(text, { language, ignoreIllegals: true }).value;
        }
        const subset = HIGHLIGHT_LANGUAGES.filter(name => hljs.getLanguage(name));
        return hljs.highlightAuto(text, subset).value;
    } catch (_) {
        return escapeHtml(text);
    }
}

function highlightAnswerCode(root) {
    root.querySelectorAll('.answer-content.is-rich').forEach(answer => {
        const language = answer.dataset.language || '';
        answer.querySelectorAll('pre').forEach(block => {
            if (block.dataset.highlighted) return;
            const text = (block.textContent || '').replace(/\n+$/, '');
            if (!text.trim()) return;
            block.innerHTML = highlightCode(text, language);
            block.dataset.highlighted = '1';
        });
    });
}

function cleanAnswerHtml(html) {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    container.querySelectorAll('pre').forEach(block => {
        block.textContent = (block.textContent || '').replace(/\n+$/, '');
        block.className = 'ql-syntax';
        block.setAttribute('spellcheck', 'false');
        block.removeAttribute('data-highlighted');
    });
    return container.innerHTML;
}

function refreshAnswerEditorHighlight() {
    if (!answerEditor) return;
    try {
        const syntax = answerEditor.getModule('syntax');
        if (syntax && typeof syntax.highlight === 'function') syntax.highlight(null, true);
    } catch (_) {}
}

function applyTheme(theme, animate) {
    const root = document.documentElement;
    if (animate) {
        root.classList.add('is-theme-changing');
        setTimeout(() => root.classList.remove('is-theme-changing'), 450);
    }
    root.setAttribute('data-theme', theme);
    storage.set(STORAGE_KEYS.theme, theme);
    const toggle = $('themeToggle');
    if (toggle) toggle.innerHTML = theme === 'dark' ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon-stars"></i>';
    const meta = $('themeColorMeta');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#171236' : '#ffffff');
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
}

const statusOf = question => (STATUS_META[question?.status] ? question.status : 'new');

function purgeLegacyLocalStatuses() {
    try {
        Object.keys(localStorage)
            .filter(key => /^prep_status_\d+$/.test(key))
            .forEach(key => localStorage.removeItem(key));
    } catch (_) {}
}

const getReads = id => parseInt(storage.get(STORAGE_KEYS.reads + id)) || 0;
const getLastRead = id => parseInt(storage.get(STORAGE_KEYS.lastRead + id)) || 0;
const getSets = id => parseInt(storage.get(STORAGE_KEYS.sets + id)) || 0;
const getTime = id => parseInt(storage.get(STORAGE_KEYS.time + id)) || 0;

function formatClock(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const minuteText = hours ? String(minutes).padStart(2, '0') : String(minutes);
    return (hours ? hours + ':' : '') + minuteText + ':' + String(seconds).padStart(2, '0');
}

function formatShort(totalSeconds) {
    if (totalSeconds < 60) return totalSeconds + 's';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatRelativeDay(timestamp) {
    if (!timestamp) return 'never';
    const startOfDay = value => {
        const date = new Date(value);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    };
    const days = Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return days + ' days ago';
}

function describeSetLevel(sets) {
    if (sets >= READY_SET_TARGET) return 'Interview ready';
    if (sets === 2) return 'Getting solid';
    if (sets === 1) return 'Learning';
    return 'Not revised yet';
}

function getDayKey(date = new Date()) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

const getDaySeconds = date => parseInt(storage.get(STORAGE_KEYS.day + getDayKey(date))) || 0;

function getStreakDays() {
    const date = new Date();
    if (!getDaySeconds(date)) date.setDate(date.getDate() - 1);
    let streak = 0;
    while (getDaySeconds(date) > 0) {
        streak++;
        date.setDate(date.getDate() - 1);
    }
    return streak;
}

function paintStudyMeter() {
    setText('streakCount', getStreakDays());
    setText('todayTime', formatShort(getDaySeconds(new Date())));
}

function getQuestions(topicId) {
    return state.questionCache[topicId] || [];
}

function findQuestion(id) {
    return getQuestions(state.activeTopic?.id).find(question => String(question.id) === String(id));
}

function getVisibleQuestions() {
    let questions = getQuestions(state.activeTopic?.id);
    if (state.difficultyFilter !== 'all') questions = questions.filter(question => question.difficulty === state.difficultyFilter);
    if (state.statusFilter !== 'all') questions = questions.filter(question => statusOf(question) === state.statusFilter);
    return questions;
}

function estimateReadSeconds(question) {
    const stripTags = text => String(text || '').replace(/<[^>]*>/g, ' ');
    const points = Array.isArray(question?.points) ? question.points.join(' ') : '';
    const words = (stripTags(question?.answer) + ' ' + stripTags(question?.description) + ' ' + points).split(/\s+/).filter(Boolean).length;
    return Math.max(20, Math.round((words / 180) * 60));
}

function formatReadEstimate(question) {
    const seconds = estimateReadSeconds(question);
    return seconds < 60 ? `about ${seconds}s` : `about ${Math.ceil(seconds / 60)} min`;
}

function startStudyTimer(questionId) {
    stopStudyTimer();
    studyTimer.questionId = questionId;
    studyTimer.sessionSeconds = 0;
    studyTimer.tickCount = 0;
    studyTimer.estimateSeconds = estimateReadSeconds(findQuestion(questionId));
    studyTimer.intervalId = setInterval(tickStudyTimer, 1000);
    paintStudyBar(questionId);
}

function stopStudyTimer() {
    if (studyTimer.intervalId) clearInterval(studyTimer.intervalId);
    studyTimer.intervalId = null;
    studyTimer.questionId = null;
}

function tickStudyTimer() {
    if (document.hidden || !studyTimer.questionId) return;
    studyTimer.sessionSeconds++;
    studyTimer.tickCount++;
    storage.set(STORAGE_KEYS.time + studyTimer.questionId, String(getTime(studyTimer.questionId) + 1));
    const dayKey = STORAGE_KEYS.day + getDayKey();
    storage.set(dayKey, String((parseInt(storage.get(dayKey)) || 0) + 1));
    paintStudyBar(studyTimer.questionId, true);
    paintStudyMeter();
    if (studyTimer.tickCount % 10 === 0 && state.activeTopic) renderTopicStats(state.activeTopic.id);
}

function paintStudyBar(id, isLive) {
    const bar = $('study-bar-' + id);
    if (!bar) return;
    const setField = (name, value) => {
        const element = bar.querySelector(`[data-field="${name}"]`);
        if (element && element.textContent !== String(value)) element.textContent = value;
    };
    const question = findQuestion(id);
    const isTimed = String(studyTimer.questionId) === String(id);
    const session = isTimed ? studyTimer.sessionSeconds : 0;
    const estimate = isTimed ? studyTimer.estimateSeconds : estimateReadSeconds(question);
    setField('session', formatClock(session));
    setField('estimate', `of ${formatReadEstimate(question)}`);
    setField('total', formatClock(getTime(id)));
    setField('sets', getSets(id));
    setField('level', describeSetLevel(getSets(id)));
    setField('opens', getReads(id));
    setField('last', 'last read ' + formatRelativeDay(getLastRead(id)));
    const progress = bar.querySelector('[data-field="bar"]');
    if (progress) {
        const percent = Math.min(100, Math.round((session / estimate) * 100));
        progress.style.width = percent + '%';
        progress.classList.toggle('is-full', percent >= 100);
    }
    if (!isLive) paintQuestionBadges(id);
}

function buildPips(sets) {
    let markup = '';
    for (let index = 0; index < READY_SET_TARGET; index++) {
        markup += `<i class="pip${index < sets ? ' is-on' : ''}"></i>`;
    }
    return markup;
}

function paintQuestionBadges(id, shouldBump) {
    const sets = getSets(id);
    const reads = getReads(id);
    const pips = document.querySelector(`[data-pips-for="${id}"]`);
    const readCount = document.querySelector(`[data-reads-for="${id}"]`);
    if (pips) {
        pips.innerHTML = buildPips(sets);
        pips.title = `${sets} completed ${sets === 1 ? 'set' : 'sets'} · ${describeSetLevel(sets)}`;
        if (shouldBump) {
            pips.classList.remove('is-bumping');
            void pips.offsetWidth;
            pips.classList.add('is-bumping');
        }
    }
    if (readCount) {
        readCount.classList.toggle('is-zero', !reads);
        readCount.innerHTML = `<i class="bi bi-eye"></i>${reads}`;
    }
}

function completeSet(id, event) {
    storage.set(STORAGE_KEYS.sets + id, String(getSets(id) + 1));
    paintStudyBar(id);
    paintQuestionBadges(id, true);
    const question = findQuestion(id);
    if (question && statusOf(question) === 'new') setStatus(id, 'reading');
    if (state.activeTopic) renderTopicStats(state.activeTopic.id);
    paintOverview();
    const sets = getSets(id);
    showToast('success', `Set ${sets} complete. ${describeSetLevel(sets)}`);
    if (sets === READY_SET_TARGET) burstConfetti(event.clientX, event.clientY);
}

function bumpRead(id) {
    storage.set(STORAGE_KEYS.reads + id, String(getReads(id) + 1));
    storage.set(STORAGE_KEYS.lastRead + id, String(Date.now()));
    paintStudyBar(id);
    if (state.activeTopic) renderTopicStats(state.activeTopic.id);
}

function getOpenQuestionMap() {
    try { return JSON.parse(storage.get(STORAGE_KEYS.openQuestions)) || {}; } catch (_) { return {}; }
}

function saveOpenQuestion(topicId, questionId) {
    const map = getOpenQuestionMap();
    if (questionId) map[topicId] = String(questionId); else delete map[topicId];
    storage.set(STORAGE_KEYS.openQuestions, JSON.stringify(map));
}

function getSavedOpenQuestion(topicId) {
    return getOpenQuestionMap()[topicId] || null;
}

function burstConfetti(x, y) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const originX = x || innerWidth / 2;
    const originY = y || 160;
    for (let index = 0; index < 44; index++) {
        const piece = document.createElement('i');
        piece.className = 'confetti-piece';
        const angle = Math.random() * Math.PI * 2;
        const distance = 90 + Math.random() * 190;
        piece.style.left = originX + 'px';
        piece.style.top = originY + 'px';
        piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
        piece.style.setProperty('--drift-x', Math.cos(angle) * distance + 'px');
        piece.style.setProperty('--drift-y', Math.sin(angle) * distance - 60 + 'px');
        piece.style.setProperty('--spin', Math.round(Math.random() * 720 - 360) + 'deg');
        piece.style.animationDelay = Math.random() * 120 + 'ms';
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 1800);
    }
}

function paintStatusControls(id, status) {
    const meta = STATUS_META[status] || STATUS_META.new;
    document.querySelectorAll(`[data-status-button="${id}"]`).forEach(button => {
        const isLarge = button.classList.contains('is-large');
        button.dataset.status = status;
        button.className = `status-chip is-${status}${isLarge ? ' is-large' : ''}`;
        button.innerHTML = `<i class="bi ${meta.icon}"></i><span>${meta.label}</span>`;
        button.title = `Mark as ${STATUS_NEXT[status]}`;
    });
    const row = $('question-row-' + id);
    if (row) {
        row.classList.remove('status-new', 'status-reading', 'status-done');
        row.classList.add('status-' + status);
    }
}

async function setStatus(id, next) {
    const question = findQuestion(id);
    const previous = question ? statusOf(question) : 'new';
    if (question) question.status = next;
    paintStatusControls(id, next);
    updateTopicProgress(state.activeTopic?.id);

    const response = await apiRequest('update_status', 'POST', { id, status: next });
    const saved = !response || response.success !== false;

    if (!saved) {
        if (question) question.status = previous;
        paintStatusControls(id, previous);
        updateTopicProgress(state.activeTopic?.id);
        showToast('error', 'Could not save status');
    }
    return saved;
}

async function cycleStatus(id, current, event) {
    const next = STATUS_NEXT[current] || 'new';
    const originX = event.clientX;
    const originY = event.clientY;
    const saving = setStatus(id, next);

    document.querySelectorAll(`[data-status-button="${id}"]`).forEach(button => {
        button.classList.add('is-swapping');
        setTimeout(() => button.classList.remove('is-swapping'), 420);
    });
    const row = $('question-row-' + id);
    if (row) {
        row.classList.add('is-flashing');
        setTimeout(() => row.classList.remove('is-flashing'), 700);
    }
    if (next === 'done') {
        const questions = getQuestions(state.activeTopic?.id);
        if (questions.length && questions.every(question => statusOf(question) === 'done')) burstConfetti(originX, originY);
    }

    if (!(await saving)) return;
    if (state.statusFilter !== 'all' && next !== state.statusFilter) removeQuestionRow(id);
}

function removeQuestionRow(id) {
    const row = $('question-row-' + id);
    if (!row) return;
    const wasSelected = String(state.selectedQuestionId) === String(id);
    const neighbour = [row.nextElementSibling, row.previousElementSibling].find(sibling => sibling && sibling.classList.contains('question-row'));
    row.classList.add('is-leaving');
    setTimeout(() => {
        row.remove();
        const list = $('questionList');
        if (!list.querySelector('.question-row')) {
            renderQuestionList();
            return;
        }
        renumberQuestionRows();
        if (!wasSelected) {
            paintReaderPosition();
            return;
        }
        if (neighbour && neighbour.isConnected && isSplitView()) selectQuestion(neighbour.dataset.id, { countRead: false });
        else closeReader();
    }, 320);
}

function renumberQuestionRows() {
    $('questionList').querySelectorAll('.question-row').forEach((row, index) => {
        const number = row.querySelector('.question-row-number');
        if (number) number.textContent = index + 1;
    });
}

function renderTopicStats(topicId) {
    const box = $('topicStats');
    if (!box) return;
    const questions = state.questionCache[topicId];
    if (!questions) {
        box.innerHTML = '';
        return;
    }
    let newCount = 0;
    let readingCount = 0;
    let doneCount = 0;
    let setCount = 0;
    let seconds = 0;
    questions.forEach(question => {
        const status = statusOf(question);
        if (status === 'done') doneCount++;
        else if (status === 'reading') readingCount++;
        else newCount++;
        setCount += getSets(question.id);
        seconds += getTime(question.id);
    });
    const total = questions.length;
    const percent = total ? Math.round((doneCount / total) * 100) : 0;

    if (!box.querySelector('.ring-value')) {
        box.innerHTML = `
            <div class="progress-ring">
                <svg viewBox="0 0 44 44" aria-hidden="true">
                    <circle class="ring-track" cx="22" cy="22" r="18"></circle>
                    <circle class="ring-value" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="0 100"></circle>
                </svg>
                <span class="ring-label"></span>
            </div>
            <div class="stat-chips">
                <span class="stat-chip stat-chip-done" title="Questions marked done"><i class="bi bi-check-circle-fill"></i><b data-metric="done"></b> done</span>
                <span class="stat-chip stat-chip-reading"><i class="bi bi-book-half"></i><b data-metric="reading"></b> reading</span>
                <span class="stat-chip"><i class="bi bi-circle"></i><b data-metric="new"></b> new</span>
                <span class="stat-chip stat-chip-sets" title="Completed revision sets"><i class="bi bi-arrow-repeat"></i><b data-metric="sets"></b> sets</span>
                <span class="stat-chip stat-chip-time" title="Total study time in this topic"><i class="bi bi-stopwatch"></i><b data-metric="time"></b></span>
            </div>`;
        box.querySelector('.ring-value').getBoundingClientRect();
    }

    const setMetric = (name, value) => {
        const element = box.querySelector(`[data-metric="${name}"]`);
        if (!element || element.textContent === String(value)) return;
        element.textContent = value;
        const chip = element.closest('.stat-chip');
        chip.classList.remove('is-bumping');
        void chip.offsetWidth;
        chip.classList.add('is-bumping');
    };

    box.querySelector('.ring-value').setAttribute('stroke-dasharray', `${percent} 100`);
    box.querySelector('.progress-ring').classList.toggle('is-complete', percent === 100);
    box.querySelector('.ring-label').textContent = percent + '%';
    setMetric('done', doneCount);
    setMetric('reading', readingCount);
    setMetric('new', newCount);
    setMetric('sets', setCount);
    setMetric('time', formatShort(seconds));
}

function updateTopicProgress(topicId) {
    if (!topicId || !state.questionCache[topicId]) return;
    if (state.activeTopic && String(state.activeTopic.id) === String(topicId)) renderTopicStats(topicId);
    const questions = state.questionCache[topicId];
    const total = questions.length;
    if (!total) return;
    const done = questions.filter(question => statusOf(question) === 'done').length;
    const percent = Math.round((done / total) * 100);
    const fill = document.querySelector(`[data-topic-fill="${topicId}"]`);
    const label = document.querySelector(`[data-topic-done="${topicId}"]`);
    if (fill) {
        fill.style.width = percent + '%';
        fill.classList.toggle('is-complete', percent === 100);
    }
    if (label) label.textContent = `${done}/${total}`;
    paintOverview();
}

function paintOverview() {
    const questions = Object.values(state.questionCache).flat();
    const total = questions.length;
    const done = questions.filter(question => statusOf(question) === 'done').length;
    const ready = questions.filter(question => getSets(question.id) >= READY_SET_TARGET).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const fill = $('overviewFill');
    if (fill) fill.style.width = percent + '%';
    if (!state.topics.length) {
        setText('overviewText', 'No topics yet. Create your first topic to get started.');
        return;
    }
    setText('overviewText', `${done} of ${total} questions done across ${state.topics.length} ${state.topics.length === 1 ? 'topic' : 'topics'}. ${ready} interview ready.`);
}

async function loadTopics(preferredTopicId) {
    const response = await apiRequest('get_topics');
    if (!response.success) {
        setText('overviewText', response.message || 'Could not load topics.');
        return;
    }
    state.topics = response.data;
    await Promise.all(state.topics.map(topic => preloadTopicQuestions(topic.id)));
    renderTopicList();
    paintOverview();
    const targetId = preferredTopicId ?? storage.get(STORAGE_KEYS.activeTopic);
    const topic = state.topics.find(item => String(item.id) === String(targetId));
    if (topic) selectTopic(topic, true);
}

async function preloadTopicQuestions(topicId) {
    if (state.questionCache[topicId]) return;
    const response = await apiRequest('get_questions', 'GET', null, { topic_id: topicId });
    if (response.success) state.questionCache[topicId] = response.data;
}

async function refreshWorkspace() {
    state.questionCache = {};
    await loadTopics(state.activeTopic?.id);
}

function persistFilters() {
    if (state.activeTopic) storage.set(STORAGE_KEYS.activeTopic, state.activeTopic.id);
    storage.set(STORAGE_KEYS.statusFilter, state.statusFilter);
    storage.set(STORAGE_KEYS.difficultyFilter, state.difficultyFilter);
}

function restoreFilters() {
    state.statusFilter = storage.get(STORAGE_KEYS.statusFilter) || 'all';
    state.difficultyFilter = storage.get(STORAGE_KEYS.difficultyFilter) || 'all';
    state.practiceMode = storage.get(STORAGE_KEYS.practiceMode) === '1';
    state.focusMode = storage.get(STORAGE_KEYS.focusMode) === '1';
    document.body.classList.toggle('is-focus-mode', state.focusMode);
    document.documentElement.classList.remove('is-focus-preload');
    syncFilterButtons();
}

function syncFilterButtons() {
    document.querySelectorAll('[data-action="filter-status"]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.value === state.statusFilter);
    });
    document.querySelectorAll('[data-action="filter-difficulty"]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.value === state.difficultyFilter);
    });
}

function renderTopicList() {
    const list = $('topicList');
    if (!state.topics.length) {
        list.innerHTML = '<div class="rail-empty"><i class="bi bi-folder2-open"></i><p>No topics yet. Add one to start collecting questions.</p></div>';
        return;
    }
    list.innerHTML = state.topics.map(topic => {
        const questions = state.questionCache[topic.id];
        const total = parseInt(topic.question_count) || 0;
        const done = questions ? questions.filter(question => statusOf(question) === 'done').length : 0;
        const percent = total ? Math.round((done / total) * 100) : 0;
        const isActive = String(state.activeTopic?.id) === String(topic.id);
        return `
        <div class="topic-item${isActive ? ' is-active' : ''}" role="button" tabindex="0" data-action="select-topic" data-id="${topic.id}" style="--topic-color:${escapeHtml(topic.color)}">
            <span class="topic-badge"><i class="bi ${escapeHtml(topic.icon)}"></i></span>
            <span class="topic-info">
                <span class="topic-name">${escapeHtml(topic.name)}</span>
                <span class="topic-meter"><span class="topic-meter-fill${percent === 100 ? ' is-complete' : ''}" data-topic-fill="${topic.id}" style="width:${percent}%"></span></span>
            </span>
            <span class="topic-tally">
                <span class="topic-total">${topic.question_count}</span>
                <span class="topic-done-label" data-topic-done="${topic.id}">${done ? done + '/' + total : ''}</span>
            </span>
            <span class="topic-tools">
                <button type="button" data-action="edit-topic" data-id="${topic.id}" title="Edit topic" aria-label="Edit topic"><i class="bi bi-pencil"></i></button>
                <button type="button" class="is-danger" data-action="delete-topic" data-id="${topic.id}" title="Delete topic" aria-label="Delete topic"><i class="bi bi-trash"></i></button>
            </span>
        </div>`;
    }).join('');
}

function showStage(mode) {
    $('welcomeScreen').hidden = mode !== 'welcome';
    $('studyDesk').hidden = mode !== 'desk';
}

function showPaneHeader(show) {
    $('paneHeader').hidden = !show;
}

function toggleQuestionButtons(show) {
    $('topbarAddQuestion').hidden = !show;
    $('navAddQuestion').hidden = !show;
}

function showReaderEmpty() {
    $('readerEmpty').hidden = false;
    $('readerContent').hidden = true;
    document.body.classList.remove('reader-open');
}

function selectTopic(topic, keepFilters) {
    stopStudyTimer();
    state.activeTopic = topic;
    state.selectedQuestionId = null;
    state.isSearching = false;
    $('searchInput').value = '';
    if (!keepFilters) {
        state.statusFilter = 'all';
        state.difficultyFilter = 'all';
    }
    syncFilterButtons();
    renderTopicList();
    $('paneTopicName').textContent = topic.name;
    $('paneTopicIcon').innerHTML = `<i class="bi ${escapeHtml(topic.icon)}"></i>`;
    $('paneTopicIcon').style.setProperty('--topic-color', topic.color);
    toggleQuestionButtons(true);
    showStage('desk');
    showPaneHeader(true);
    showReaderEmpty();
    renderTopicStats(topic.id);
    loadQuestions(topic.id);
    persistFilters();
}

async function loadQuestions(topicId, forceReload) {
    const list = $('questionList');
    if (!forceReload && state.questionCache[topicId]) {
        renderQuestionList();
        return;
    }
    list.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const response = await apiRequest('get_questions', 'GET', null, { topic_id: topicId });
    if (String(state.activeTopic?.id) !== String(topicId) || state.isSearching) return;
    if (!response.success) {
        list.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>Questions could not be loaded. Check your connection and try again.</p></div>';
        return;
    }
    state.questionCache[topicId] = response.data;
    renderQuestionList();
    updateTopicProgress(topicId);
    renderTopicList();
}

function isRichHtml(text) {
    return /<(p|ul|ol|li|strong|em|h[123]|blockquote|br|pre)[^>]*>/i.test(text);
}

function splitIntoSentences(text) {
    const sentences = [];
    let lastIndex = 0;
    const pattern = /[.!?]+(?=\s|$)/g;
    let match;
    while ((match = pattern.exec(text))) {
        const end = match.index + match[0].length;
        sentences.push(text.slice(lastIndex, end));
        lastIndex = end;
    }
    if (lastIndex < text.length) sentences.push(text.slice(lastIndex));
    return sentences;
}

function wrapTextNodeSentences(node) {
    const text = node.nodeValue;
    if (!text || !text.trim() || !node.parentNode) return;
    const fragment = document.createDocumentFragment();
    splitIntoSentences(text).forEach(part => {
        if (!part.trim()) {
            fragment.appendChild(document.createTextNode(part));
            return;
        }
        const span = document.createElement('span');
        span.className = 'sentence-mark';
        span.textContent = part;
        fragment.appendChild(span);
    });
    node.parentNode.replaceChild(fragment, node);
}

function wrapSentencesInNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return wrapTextNodeSentences(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (['PRE', 'CODE', 'SCRIPT', 'STYLE'].includes(node.tagName) || node.classList.contains('sentence-mark')) return;
    Array.from(node.childNodes).forEach(wrapSentencesInNode);
}

function enhanceReadableSections(root) {
    root.querySelectorAll('.answer-content, .description-text, .key-point-text').forEach(section => {
        Array.from(section.childNodes).forEach(wrapSentencesInNode);
    });
}

const isBlankParagraph = paragraph => (paragraph.textContent || '').replace(/[\s\u00A0]/g, '').length === 0;
const matchDashBullet = paragraph => (paragraph.textContent || '').match(/^([\u00A0]*)-\s*(.*)$/s);

function normalizeRichAnswer(element) {
    const children = Array.from(element.children);
    let index = 0;
    while (index < children.length) {
        const node = children[index];
        if (node.tagName !== 'P') { index++; continue; }
        if (isBlankParagraph(node)) { node.remove(); index++; continue; }
        if (!matchDashBullet(node)) { index++; continue; }
        let end = index;
        const items = [];
        while (end < children.length) {
            const candidate = children[end];
            if (candidate.tagName !== 'P') break;
            const match = matchDashBullet(candidate);
            if (!match) break;
            items.push({ level: match[1].length, html: candidate.innerHTML.replace(/^(?:&nbsp;|\u00A0)*-\s*/, '') });
            end++;
        }
        const list = document.createElement('ul');
        list.className = 'answer-list';
        let parentItem = null;
        items.forEach(item => {
            const listItem = document.createElement('li');
            listItem.innerHTML = item.html;
            if (item.level > 0 && parentItem) {
                let sublist = parentItem.querySelector(':scope > ul.answer-sublist');
                if (!sublist) {
                    sublist = document.createElement('ul');
                    sublist.className = 'answer-sublist';
                    parentItem.appendChild(sublist);
                }
                sublist.appendChild(listItem);
            } else {
                list.appendChild(listItem);
                parentItem = listItem;
            }
        });
        element.insertBefore(list, children[index]);
        for (let position = index; position < end; position++) children[position].remove();
        index = end;
    }
}

function buildQuestionRow(question, number) {
    const status = statusOf(question);
    const meta = STATUS_META[status];
    const difficulty = escapeHtml(question.difficulty);
    const sets = getSets(question.id);
    const reads = getReads(question.id);
    const isSelected = String(question.id) === String(state.selectedQuestionId);
    return `
    <article class="question-row status-${status}${isSelected ? ' is-selected' : ''}" id="question-row-${question.id}" role="button" tabindex="0" data-action="select-question" data-id="${question.id}">
        <span class="question-row-number">${number}</span>
        <div class="question-row-body">
            <h3 class="question-row-title">${escapeHtml(question.question)}</h3>
            <div class="question-row-meta">
                <button type="button" class="status-chip is-${status}" data-action="cycle-status" data-status-button="${question.id}" data-id="${question.id}" data-status="${status}" title="Mark as ${STATUS_NEXT[status]}">
                    <i class="bi ${meta.icon}"></i><span>${meta.label}</span>
                </button>
                <span class="difficulty-tag is-${difficulty}">${difficulty}</span>
                <span class="readiness-pips" data-pips-for="${question.id}" title="${sets} completed ${sets === 1 ? 'set' : 'sets'} · ${describeSetLevel(sets)}">${buildPips(sets)}</span>
                <span class="read-count${reads ? '' : ' is-zero'}" data-reads-for="${question.id}" title="Times opened"><i class="bi bi-eye"></i>${reads}</span>
            </div>
        </div>
    </article>`;
}

function renderQuestionList() {
    const list = $('questionList');
    const visible = getVisibleQuestions();
    const topicId = state.activeTopic?.id;

    if (!visible.length) {
        stopStudyTimer();
        state.selectedQuestionId = null;
        list.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No questions match these filters. Try a different status or level.</p></div>';
        showReaderEmpty();
        return;
    }

    const visibleIds = visible.map(question => String(question.id));
    const candidates = [state.selectedQuestionId, getSavedOpenQuestion(topicId)];
    let targetId = candidates.find(id => id && visibleIds.includes(String(id)));
    if (!targetId && isSplitView()) targetId = visible[0].id;

    state.selectedQuestionId = targetId ? String(targetId) : null;
    list.innerHTML = visible.map((question, index) => buildQuestionRow(question, index + 1)).join('');

    if (targetId) {
        selectQuestion(targetId, { countRead: false });
    } else {
        stopStudyTimer();
        showReaderEmpty();
        const savedScroll = storage.get(STORAGE_KEYS.listScroll + topicId);
        if (savedScroll) list.scrollTop = parseInt(savedScroll);
    }
}

function buildAnswerHtml(answer, language) {
    if (!answer) return '';
    if (isRichHtml(answer)) {
        return `<div class="answer-content is-rich" data-language="${escapeHtml(language)}">${answer}</div>`;
    }
    const paragraphs = answer.split(/\n\n+/).filter(part => part.trim()).map(part => {
        const text = part.trim();
        if (text.startsWith('```') || /^(def |class |import |from |SELECT |INSERT |UPDATE |function |<\?php)/.test(text)) {
            return `<pre class="answer-code">${escapeHtml(text.replace(/^```\w*\n?/, '').replace(/```$/, '').trim())}</pre>`;
        }
        return `<p class="answer-paragraph">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return `<div class="answer-content">${paragraphs}</div>`;
}

function buildReader(question) {
    const language = question.language || 'python';
    const highlightLanguage = language === 'text' ? 'plaintext' : language;
    const status = statusOf(question);
    const meta = STATUS_META[status];
    const difficulty = escapeHtml(question.difficulty);
    const topic = state.activeTopic;
    const id = question.id;

    const visible = getVisibleQuestions();
    const position = visible.findIndex(item => String(item.id) === String(id));
    const upNext = position !== -1 ? visible[position + 1] : null;

    const answerSection = question.answer ? `
        <section class="reader-section answer-block${state.practiceMode ? ' is-concealed' : ''}" id="answerBlock">
            <h4 class="section-label"><i class="bi bi-chat-square-text"></i>Answer</h4>
            <div class="answer-frame">
                ${buildAnswerHtml(question.answer, language)}
                <button type="button" class="reveal-button" data-action="reveal-answer"><i class="bi bi-eye"></i>Reveal answer</button>
            </div>
        </section>` : '';

    const descriptionSection = question.description ? `
        <section class="reader-section">
            <h4 class="section-label"><i class="bi bi-card-text"></i>Description</h4>
            <div class="description-text">${escapeHtml(question.description)}</div>
        </section>` : '';

    const pointsSection = question.points?.length ? `
        <section class="reader-section">
            <h4 class="section-label"><i class="bi bi-lightbulb"></i>Key points</h4>
            <div class="key-points">${question.points.map(point => `<div class="key-point"><span class="key-point-text">${escapeHtml(point)}</span></div>`).join('')}</div>
        </section>` : '';

    const codeSection = question.code_example ? `
        <section class="reader-section">
            <h4 class="section-label"><i class="bi bi-code-slash"></i>Example code</h4>
            <div class="code-window">
                <div class="code-window-bar">
                    <span class="code-window-language">${escapeHtml(LANGUAGE_LABELS[language] || language)}</span>
                    <button type="button" class="copy-button" data-action="copy-code"><i class="bi bi-clipboard"></i>Copy</button>
                </div>
                <pre><code class="language-${highlightLanguage}">${escapeHtml(question.code_example)}</code></pre>
            </div>
        </section>` : '';

    const sideColumn = pointsSection + codeSection;

    const upNextCard = upNext ? `
        <button type="button" class="up-next" data-action="next-question">
            <span class="up-next-text"><small>Up next</small><b>${escapeHtml(upNext.question)}</b></span>
            <i class="bi bi-arrow-right"></i>
        </button>` : '';

    return `
    <div class="reader-toolbar">
        <button type="button" class="button button-ghost button-small reader-back" data-action="close-reader"><i class="bi bi-chevron-left"></i>Questions</button>
        <div class="reader-nav">
            <button type="button" class="icon-button icon-button-small" data-action="previous-question" title="Previous question (K)" aria-label="Previous question"><i class="bi bi-chevron-up"></i></button>
            <span class="reader-position" data-field="position"></span>
            <button type="button" class="icon-button icon-button-small" data-action="next-question" title="Next question (J)" aria-label="Next question"><i class="bi bi-chevron-down"></i></button>
        </div>
        <div class="reader-toolbar-actions">
            <button type="button" class="button button-ghost button-small mode-toggle practice-toggle${state.practiceMode ? ' is-active' : ''}" data-action="toggle-practice" aria-pressed="${state.practiceMode}" title="Hide the answer until you reveal it (P)">
                <i class="bi bi-eye-slash"></i><span class="toolbar-label">Practice</span>
            </button>
            <button type="button" class="button button-ghost button-small mode-toggle focus-toggle${state.focusMode ? ' is-active' : ''}" data-action="toggle-focus" aria-pressed="${state.focusMode}" title="Hide the question list for a wider reading area (F)">
                <i class="bi bi-arrows-fullscreen"></i><span class="toolbar-label">Focus</span>
            </button>
            <button type="button" class="icon-button icon-button-small" data-action="edit-question" data-id="${id}" title="Edit question" aria-label="Edit question"><i class="bi bi-pencil"></i></button>
            <button type="button" class="icon-button icon-button-small icon-button-danger" data-action="delete-question" data-id="${id}" title="Delete question" aria-label="Delete question"><i class="bi bi-trash"></i></button>
        </div>
    </div>

    <div class="reader-scroll" id="readerScroll">
        <header class="reader-hero">
            <div class="reader-tags">
                <span class="reader-topic" style="--topic-color:${escapeHtml(topic?.color || '#e92a7c')}"><i class="bi ${escapeHtml(topic?.icon || 'bi-folder')}"></i>${escapeHtml(topic?.name || '')}</span>
                <span class="difficulty-tag is-${difficulty}">${difficulty}</span>
                <span class="reader-estimate"><i class="bi bi-hourglass-split"></i>${formatReadEstimate(question)} read</span>
            </div>
            <h6 class="reader-question" style="font-size: 30px;">${escapeHtml(question.question)}</h6>
        </header>

        <div class="reader-columns${sideColumn ? '' : ' is-single'}">
            <div class="reader-column reader-column-main">
                ${answerSection}
                ${descriptionSection}
            </div>
            ${sideColumn ? `<div class="reader-column reader-column-side">${sideColumn}</div>` : ''}
        </div>

        ${upNextCard}
    </div>

    <footer class="study-bar" id="study-bar-${id}">
        <div class="study-stat study-stat-timer">
            <i class="bi bi-stopwatch"></i>
            <div><b data-field="session">0:00</b><small data-field="estimate"></small></div>
            <span class="study-bar-progress"><span data-field="bar"></span></span>
        </div>
        <div class="study-stat study-stat-total">
            <i class="bi bi-hourglass-split"></i>
            <div><b data-field="total">0:00</b><small>total time</small></div>
        </div>
        <div class="study-stat study-stat-sets">
            <i class="bi bi-arrow-repeat"></i>
            <div><b data-field="sets">0</b><small data-field="level"></small></div>
            <button type="button" class="set-button" data-action="complete-set" data-id="${id}">+1 set</button>
        </div>
        <div class="study-stat study-stat-opens">
            <i class="bi bi-eye"></i>
            <div><b data-field="opens">0</b><small data-field="last"></small></div>
        </div>
        <button type="button" class="status-chip is-${status} is-large study-status" data-action="cycle-status" data-status-button="${id}" data-id="${id}" data-status="${status}" title="Mark as ${STATUS_NEXT[status]}">
            <i class="bi ${meta.icon}"></i><span>${meta.label}</span>
        </button>
    </footer>`;
}

function renderReader(question) {
    const content = $('readerContent');
    content.innerHTML = buildReader(question);
    $('readerEmpty').hidden = true;
    content.hidden = false;
    content.classList.remove('is-entering');
    void content.offsetWidth;
    content.classList.add('is-entering');
    content.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    content.querySelectorAll('.answer-content.is-rich').forEach(normalizeRichAnswer);
    highlightAnswerCode(content);
    enhanceReadableSections(content);
    paintReaderPosition();
    paintStudyBar(question.id);
}

function paintReaderPosition() {
    const label = document.querySelector('[data-field="position"]');
    if (!label) return;
    const ids = getVisibleQuestions().map(question => String(question.id));
    const index = ids.indexOf(String(state.selectedQuestionId));
    label.textContent = index === -1 ? '' : `${index + 1} of ${ids.length}`;
}

function selectQuestion(id, options = {}) {
    const question = findQuestion(id);
    if (!question || !state.activeTopic) return;
    state.selectedQuestionId = String(id);
    document.querySelectorAll('.question-row.is-selected').forEach(row => row.classList.remove('is-selected'));
    const row = $('question-row-' + id);
    if (row) {
        row.classList.add('is-selected');
        row.scrollIntoView({ block: 'nearest' });
    }
    saveOpenQuestion(state.activeTopic.id, id);
    renderReader(question);
    if (options.countRead) bumpRead(id);
    startStudyTimer(id);
    document.body.classList.add('reader-open');
}

function closeReader() {
    stopStudyTimer();
    document.body.classList.remove('reader-open');
    if (state.activeTopic) saveOpenQuestion(state.activeTopic.id, null);
    state.selectedQuestionId = null;
    document.querySelectorAll('.question-row.is-selected').forEach(row => row.classList.remove('is-selected'));
    setTimeout(() => {
        if (!state.selectedQuestionId) showReaderEmpty();
    }, 320);
}

function navigateQuestion(step) {
    const ids = getVisibleQuestions().map(question => String(question.id));
    if (!ids.length) return;
    const current = ids.indexOf(String(state.selectedQuestionId));
    const next = Math.min(ids.length - 1, Math.max(0, (current === -1 ? 0 : current + step)));
    if (current !== -1 && next === current) return;
    selectQuestion(ids[next], { countRead: true });
}

function togglePracticeMode() {
    state.practiceMode = !state.practiceMode;
    storage.set(STORAGE_KEYS.practiceMode, state.practiceMode ? '1' : '0');
    document.querySelectorAll('[data-action="toggle-practice"]').forEach(button => {
        button.classList.toggle('is-active', state.practiceMode);
        button.setAttribute('aria-pressed', String(state.practiceMode));
    });
    const block = $('answerBlock');
    if (block) block.classList.toggle('is-concealed', state.practiceMode);
}

function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    storage.set(STORAGE_KEYS.focusMode, state.focusMode ? '1' : '0');
    document.body.classList.toggle('is-focus-mode', state.focusMode);
    closeRail();
    document.querySelectorAll('[data-action="toggle-focus"]').forEach(button => {
        button.classList.toggle('is-active', state.focusMode);
        button.setAttribute('aria-pressed', String(state.focusMode));
    });
    if (state.focusMode && !state.selectedQuestionId && isSplitView() && state.activeTopic) {
        const first = getVisibleQuestions()[0];
        if (first) selectQuestion(first.id, { countRead: false });
    }
    if (!state.focusMode && state.selectedQuestionId) {
        const row = $('question-row-' + state.selectedQuestionId);
        if (row) requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
    }
}

function setStatusFilter(value) {
    state.statusFilter = value;
    afterFilterChange();
}

function setDifficultyFilter(value) {
    state.difficultyFilter = value;
    afterFilterChange();
}

function afterFilterChange() {
    syncFilterButtons();
    persistFilters();
    stopStudyTimer();
    if (state.activeTopic) loadQuestions(state.activeTopic.id);
}

function copyCode(button) {
    const code = button.closest('.code-window').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(() => {
        button.innerHTML = '<i class="bi bi-check2"></i>Copied';
        setTimeout(() => { button.innerHTML = '<i class="bi bi-clipboard"></i>Copy'; }, 2000);
    });
}

async function runSearch() {
    const term = $('searchInput').value.trim();
    if (term.length < 2) {
        leaveSearch();
        return;
    }
    stopStudyTimer();
    state.isSearching = true;
    state.selectedQuestionId = null;
    showStage('desk');
    showPaneHeader(false);
    showReaderEmpty();
    const list = $('questionList');
    list.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
    const response = await apiRequest('search', 'GET', null, { q: term });
    if (!state.isSearching) return;
    if (!response.success) {
        list.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-circle"></i><p>${escapeHtml(response.message)}</p></div>`;
        return;
    }
    if (!response.data.length) {
        list.innerHTML = `<div class="empty-state"><i class="bi bi-search"></i><p>No results for <b>${escapeHtml(term)}</b>. Try a shorter keyword.</p></div>`;
        return;
    }
    list.innerHTML = `<div class="search-count">${response.data.length} ${response.data.length === 1 ? 'result' : 'results'} for <b>${escapeHtml(term)}</b></div>` +
        response.data.map(item => {
            const meta = STATUS_META[statusOf(item)];
            return `
            <article class="search-hit" role="button" tabindex="0" data-action="open-search-result" data-topic-id="${item.topic_id}" data-id="${item.id}">
                <span class="search-hit-topic">${escapeHtml(item.topic_name)}</span>
                <h3 class="search-hit-question">${escapeHtml(item.question)}</h3>
                <span class="status-chip is-${statusOf(item)}"><i class="bi ${meta.icon}"></i><span>${meta.label}</span></span>
            </article>`;
        }).join('');
}

function leaveSearch() {
    if (!state.isSearching && !$('studyDesk').hidden) return;
    state.isSearching = false;
    if (state.activeTopic) {
        showStage('desk');
        showPaneHeader(true);
        renderQuestionList();
    } else {
        showStage('welcome');
        showReaderEmpty();
    }
}

function openSearchResult(topicId, questionId) {
    const topic = state.topics.find(item => String(item.id) === String(topicId));
    if (!topic) return;
    if (questionId) saveOpenQuestion(topicId, questionId);
    state.statusFilter = 'all';
    state.difficultyFilter = 'all';
    selectTopic(topic, true);
}

function toggleRail() {
    const rail = $('topicRail');
    const isOpen = rail.classList.toggle('is-open');
    $('drawerBackdrop').classList.toggle('is-visible', isOpen);
}

function closeRail() {
    $('topicRail').classList.remove('is-open');
    $('drawerBackdrop').classList.remove('is-visible');
}

function focusSearch() {
    $('searchInput').focus();
}

function openAddTopic() {
    $('topicModalTitle').textContent = 'Add topic';
    $('topicIdField').value = '';
    $('topicNameField').value = '';
    $('topicIconField').value = 'bi-folder';
    $('topicColorField').value = '#e92a7c';
    $('topicOrderField').value = '0';
    bootstrap.Modal.getOrCreateInstance($('topicModal')).show();
}

function openEditTopic(id) {
    const topic = state.topics.find(item => String(item.id) === String(id));
    if (!topic) return;
    $('topicModalTitle').textContent = 'Edit topic';
    $('topicIdField').value = topic.id;
    $('topicNameField').value = topic.name;
    $('topicIconField').value = topic.icon;
    $('topicColorField').value = topic.color;
    $('topicOrderField').value = topic.sort_order;
    bootstrap.Modal.getOrCreateInstance($('topicModal')).show();
}

async function saveTopic() {
    const body = {
        id: $('topicIdField').value || null,
        name: $('topicNameField').value.trim(),
        icon: $('topicIconField').value.trim() || 'bi-folder',
        color: $('topicColorField').value,
        sort_order: $('topicOrderField').value,
    };
    if (!body.name) {
        Swal.fire({ icon: 'warning', title: 'Topic name is required', confirmButtonColor: '#e92a7c' });
        return;
    }
    const response = await apiRequest('save_topic', 'POST', body);
    bootstrap.Modal.getInstance($('topicModal'))?.hide();
    if (response.success) {
        showToast('success', response.message);
        await refreshWorkspace();
    } else {
        Swal.fire({ icon: 'error', title: response.message, confirmButtonColor: '#e92a7c' });
    }
}

async function deleteTopic(id) {
    const result = await Swal.fire({
        title: 'Delete this topic?',
        text: 'Every question in this topic will be deleted too.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete topic',
        confirmButtonColor: '#d6204f',
        cancelButtonColor: '#847fa8',
    });
    if (!result.isConfirmed) return;
    const response = await apiRequest('delete_topic', 'POST', { id });
    if (!response.success) {
        Swal.fire({ icon: 'error', title: response.message, confirmButtonColor: '#e92a7c' });
        return;
    }
    showToast('success', response.message);
    saveOpenQuestion(id, null);
    delete state.questionCache[id];
    if (String(state.activeTopic?.id) === String(id)) {
        stopStudyTimer();
        state.activeTopic = null;
        state.selectedQuestionId = null;
        storage.remove(STORAGE_KEYS.activeTopic);
        showPaneHeader(false);
        showReaderEmpty();
        showStage('welcome');
        toggleQuestionButtons(false);
    }
    await loadTopics(state.activeTopic?.id);
}

function initAnswerEditor() {
    if (answerEditor) {
        answerEditor.setContents([]);
        return;
    }
    answerEditor = new Quill('#answerEditor', {
        theme: 'snow',
        placeholder: 'Write a clear, concise answer',
        modules: {
            syntax: {
                highlight: text => highlightCode(text, $('questionLanguageField').value),
            },
            toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['blockquote', 'code-block'],
                [{ indent: '-1' }, { indent: '+1' }],
                ['clean'],
            ],
        },
    });
}

function setAnswerEditorContent(html) {
    if (!answerEditor) return;
    if (html && html.trim()) answerEditor.root.innerHTML = html;
    else answerEditor.setContents([]);
    setTimeout(refreshAnswerEditorHighlight, 0);
}

function getAnswerEditorContent() {
    if (!answerEditor) return '';
    const html = answerEditor.root.innerHTML;
    if (html === '<p><br></p>' || !html.trim()) return '';
    return cleanAnswerHtml(html);
}

function initCodeEditor(initialValue) {
    const shell = $('codeEditorShell');
    shell.innerHTML = '';
    codeEditor = CodeMirror(shell, {
        value: initialValue || '',
        mode: EDITOR_MODES[$('questionLanguageField').value] || null,
        theme: 'dracula',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        extraKeys: { Tab: editor => editor.replaceSelection('    ', 'end') },
    });
}

function updateEditorMode() {
    if (codeEditor) codeEditor.setOption('mode', EDITOR_MODES[$('questionLanguageField').value] || null);
    refreshAnswerEditorHighlight();
}

function showQuestionModal(onShown) {
    const modalElement = $('questionModal');
    modalElement.addEventListener('shown.bs.modal', onShown, { once: true });
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function openAddQuestion() {
    if (!state.activeTopic) return;
    $('questionModalTitle').textContent = 'Add question';
    $('questionIdField').value = '';
    $('questionTopicField').value = state.activeTopic.id;
    $('questionTextField').value = '';
    $('questionPointsField').value = '';
    $('questionDifficultyField').value = 'intermediate';
    $('questionLanguageField').value = 'python';
    $('questionOrderField').value = '0';
    showQuestionModal(() => {
        initAnswerEditor();
        setAnswerEditorContent('');
        initCodeEditor('');
    });
}

async function openEditQuestion(id) {
    const response = await apiRequest('get_question', 'GET', null, { id });
    if (!response.success) {
        showToast('error', response.message || 'Could not load the question');
        return;
    }
    const question = response.data;
    $('questionModalTitle').textContent = 'Edit question';
    $('questionIdField').value = question.id;
    $('questionTopicField').value = question.topic_id;
    $('questionTextField').value = question.question;
    $('questionDifficultyField').value = question.difficulty;
    $('questionPointsField').value = Array.isArray(question.points) ? question.points.join('\n') : '';
    $('questionLanguageField').value = question.language ?? 'python';
    $('questionOrderField').value = question.sort_order;
    showQuestionModal(() => {
        initAnswerEditor();
        setAnswerEditorContent(question.answer ?? '');
        initCodeEditor(question.code_example ?? '');
        updateEditorMode();
    });
}

async function saveQuestion() {
    const body = {
        id: $('questionIdField').value || null,
        topic_id: $('questionTopicField').value,
        question: $('questionTextField').value.trim(),
        answer: getAnswerEditorContent(),
        difficulty: $('questionDifficultyField').value,
        language: $('questionLanguageField').value,
        points: $('questionPointsField').value.trim(),
        code_example: (codeEditor ? codeEditor.getValue() : '').trim(),
        sort_order: $('questionOrderField').value,
    };
    if (!body.question || !body.answer) {
        Swal.fire({ icon: 'warning', title: 'Question and answer are required', confirmButtonColor: '#e92a7c' });
        return;
    }
    const response = await apiRequest('save_question', 'POST', body);
    bootstrap.Modal.getInstance($('questionModal'))?.hide();
    if (response.success) {
        if (body.id && state.activeTopic) saveOpenQuestion(state.activeTopic.id, body.id);
        showToast('success', response.message);
        await refreshWorkspace();
    } else {
        Swal.fire({ icon: 'error', title: response.message, confirmButtonColor: '#e92a7c' });
    }
}

async function deleteQuestion(id) {
    const result = await Swal.fire({
        title: 'Delete this question?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete question',
        confirmButtonColor: '#d6204f',
        cancelButtonColor: '#847fa8',
    });
    if (!result.isConfirmed) return;
    const response = await apiRequest('delete_question', 'POST', { id });
    if (!response.success) {
        Swal.fire({ icon: 'error', title: response.message, confirmButtonColor: '#e92a7c' });
        return;
    }
    showToast('success', response.message);
    if (state.activeTopic && getSavedOpenQuestion(state.activeTopic.id) === String(id)) saveOpenQuestion(state.activeTopic.id, null);
    stopStudyTimer();
    await refreshWorkspace();
}

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function updateInstallButton() {
    const button = $('installButton');
    if (!button) return;
    button.hidden = isStandalone() || !(deferredInstallPrompt || isIosDevice());
}

async function installApp() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        updateInstallButton();
        return;
    }
    Swal.fire({
        icon: 'info',
        title: 'Install on iPhone or iPad',
        html: 'Open this page in Safari, tap the <b>Share</b> button, then choose <b>Add to Home Screen</b>.',
        confirmButtonColor: '#e92a7c',
    });
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    showToast('success', 'App installed');
});

const clickActions = {
    'toggle-rail': () => toggleRail(),
    'close-rail': () => closeRail(),
    'focus-search': () => focusSearch(),
    'toggle-theme': () => toggleTheme(),
    'install-app': () => installApp(),
    'add-topic': () => openAddTopic(),
    'add-question': () => openAddQuestion(),
    'save-topic': () => saveTopic(),
    'save-question': () => saveQuestion(),
    'edit-topic': element => openEditTopic(element.dataset.id),
    'delete-topic': element => deleteTopic(element.dataset.id),
    'select-topic': element => {
        const topic = state.topics.find(item => String(item.id) === String(element.dataset.id));
        if (!topic) return;
        selectTopic(topic);
        closeRail();
    },
    'filter-status': element => setStatusFilter(element.dataset.value),
    'filter-difficulty': element => setDifficultyFilter(element.dataset.value),
    'select-question': element => {
        if (String(element.dataset.id) === String(state.selectedQuestionId) && isSplitView()) return;
        selectQuestion(element.dataset.id, { countRead: true });
    },
    'cycle-status': (element, event) => cycleStatus(element.dataset.id, element.dataset.status, event),
    'complete-set': (element, event) => completeSet(element.dataset.id, event),
    'edit-question': element => openEditQuestion(element.dataset.id),
    'delete-question': element => deleteQuestion(element.dataset.id),
    'close-reader': () => closeReader(),
    'previous-question': () => navigateQuestion(-1),
    'next-question': () => navigateQuestion(1),
    'toggle-practice': () => togglePracticeMode(),
    'toggle-focus': () => toggleFocusMode(),
    'reveal-answer': () => $('answerBlock')?.classList.remove('is-concealed'),
    'copy-code': element => copyCode(element),
    'open-search-result': element => openSearchResult(element.dataset.topicId, element.dataset.id),
};

document.addEventListener('click', event => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    const handler = clickActions[element.dataset.action];
    if (handler) handler(element, event);
});

document.addEventListener('change', event => {
    if (event.target.matches('[data-action="change-language"]')) updateEditorMode();
});

document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.key === 'Enter' && target.matches && target.matches('[role="button"][data-action]')) {
        event.preventDefault();
        target.click();
        return;
    }
    if (event.key === 'Escape') {
        closeRail();
        if (!isSplitView() && document.body.classList.contains('reader-open')) closeReader();
        return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const isTyping = target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || (target.closest && target.closest('.CodeMirror')));
    if (isTyping || document.body.classList.contains('modal-open')) return;
    const key = event.key.toLowerCase();
    if (key === '/') {
        event.preventDefault();
        focusSearch();
    } else if (key === 'j') {
        navigateQuestion(1);
    } else if (key === 'k') {
        navigateQuestion(-1);
    } else if (key === 'p' && state.selectedQuestionId) {
        togglePracticeMode();
    } else if (key === 'f' && state.activeTopic && isSplitView()) {
        toggleFocusMode();
    }
});

$('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    if (!$('searchInput').value.trim()) {
        leaveSearch();
        return;
    }
    searchTimeout = setTimeout(runSearch, 380);
});

$('questionList').addEventListener('scroll', event => {
    if (state.activeTopic && !state.isSearching) storage.set(STORAGE_KEYS.listScroll + state.activeTopic.id, event.target.scrollTop);
}, { passive: true });

document.addEventListener('DOMContentLoaded', () => {
    purgeLegacyLocalStatuses();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
    restoreFilters();
    paintStudyMeter();
    updateInstallButton();
    registerServiceWorker();
    loadTopics();
});