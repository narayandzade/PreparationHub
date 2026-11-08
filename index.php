<?php require_once 'database.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#ffffff" id="themeColorMeta">
<title>Interview Prep Hub</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Prep Hub">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script>
(function () {
  try {
    var theme = localStorage.getItem('prep_theme');
    if (!theme) theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (localStorage.getItem('prep_focus_mode') === '1') document.documentElement.classList.add('is-focus-preload');
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..600&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css">
<link rel="stylesheet" href="https://cdn.quilljs.com/1.3.7/quill.snow.css">
<link rel="stylesheet" href="style.css">
</head>
<body>

<div class="drawer-backdrop" id="drawerBackdrop" data-action="close-rail"></div>

<header class="topbar">
  <button class="icon-button topbar-menu" type="button" data-action="toggle-rail" aria-label="Open topics">
    <i class="bi bi-layout-sidebar-inset"></i>
  </button>

  <a class="brand" href="./" aria-label="Interview Prep Hub home">
    <span class="brand-mark"><i class="bi bi-highlighter"></i></span>
    <span class="brand-text">Interview Prep Hub</span>
  </a>

  <label class="search-box" for="searchInput">
    <i class="bi bi-search search-box-icon"></i>
    <input id="searchInput" type="text" placeholder="Search every question" autocomplete="off" aria-label="Search questions">
    <kbd class="search-box-key">/</kbd>
  </label>

  <div class="study-meter" id="studyMeter" title="Your study streak and time studied today">
    <span class="study-meter-item"><i class="bi bi-fire"></i><b id="streakCount">0</b><span class="study-meter-label">day streak</span></span>
    <span class="study-meter-divider"></span>
    <span class="study-meter-item"><i class="bi bi-clock-history"></i><b id="todayTime">0m</b><span class="study-meter-label">today</span></span>
  </div>

  <div class="topbar-actions">
    <button class="button button-ghost install-button" id="installButton" type="button" data-action="install-app" title="Install this app on your device" hidden>
      <i class="bi bi-download"></i><span class="button-label">Install app</span>
    </button>
    <button class="icon-button" id="themeToggle" type="button" data-action="toggle-theme" title="Switch light or dark theme" aria-label="Switch theme">
      <i class="bi bi-moon-stars"></i>
    </button>
    <button class="button button-primary" id="topbarAddQuestion" type="button" data-action="add-question" hidden>
      <i class="bi bi-plus-lg"></i><span class="button-label">Add question</span>
    </button>
    <button class="icon-button topbar-add-topic" type="button" data-action="add-topic" title="Add topic" aria-label="Add topic">
      <i class="bi bi-folder-plus"></i>
    </button>
  </div>
</header>

<div class="workspace">

  <aside class="topic-rail" id="topicRail" aria-label="Topics">
    <div class="topic-rail-header">
      <span class="topic-rail-title">Topics</span>
      <button class="icon-button icon-button-small" type="button" data-action="add-topic" title="New topic" aria-label="New topic">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
    <div class="topic-list" id="topicList"></div>
  </aside>

  <main class="stage">

    <section class="welcome" id="welcomeScreen">
      <div class="welcome-shapes" aria-hidden="true">
        <span class="welcome-shape welcome-shape-ring"></span>
        <span class="welcome-shape welcome-shape-block"></span>
        <span class="welcome-shape welcome-shape-dot"></span>
      </div>
      <div class="welcome-inner">
        <h1 class="welcome-title"><span class="welcome-marker">Say it out loud until it sticks.</span></h1>
        <p class="welcome-text">Pick a topic, open a question and let the timer count your study time. Finish a read to add a set. Three sets and the question is interview ready.</p>

        <div class="overview" aria-live="polite">
          <div class="overview-track"><span class="overview-fill" id="overviewFill"></span></div>
          <p class="overview-text" id="overviewText">Loading your progress</p>
        </div>

        <div class="status-flow" aria-label="Question status flow">
          <span class="flow-step"><i class="bi bi-circle"></i>New</span>
          <i class="bi bi-chevron-right flow-divider"></i>
          <span class="flow-step flow-step-reading"><i class="bi bi-book-half"></i>Reading</span>
          <i class="bi bi-chevron-right flow-divider"></i>
          <span class="flow-step flow-step-done"><i class="bi bi-check-circle-fill"></i>Done</span>
        </div>

        <div class="welcome-actions">
          <button class="button button-primary button-large" type="button" data-action="toggle-rail">
            <i class="bi bi-journals"></i>Browse topics
          </button>
          <button class="button button-ghost button-large" type="button" data-action="add-topic">
            <i class="bi bi-folder-plus"></i>New topic
          </button>
        </div>

        <p class="welcome-keys">
          <kbd>/</kbd> search
          <kbd>J</kbd><kbd>K</kbd> next and previous
          <kbd>P</kbd> practice mode
          <kbd>F</kbd> focus mode
        </p>
      </div>
    </section>

    <div class="study-desk" id="studyDesk" hidden>

      <section class="question-pane" aria-label="Questions">
        <header class="pane-header" id="paneHeader" hidden>
          <div class="pane-title-row">
            <span class="pane-topic-icon" id="paneTopicIcon"></span>
            <h1 class="pane-topic-name" id="paneTopicName"></h1>
          </div>
          <div class="topic-stats" id="topicStats" aria-live="polite"></div>
          <div class="filter-bar">
            <div class="segmented" role="group" aria-label="Filter by status">
              <button class="segment is-active" type="button" data-action="filter-status" data-value="all">All</button>
              <button class="segment" type="button" data-action="filter-status" data-value="new"><i class="bi bi-circle"></i>New</button>
              <button class="segment segment-reading" type="button" data-action="filter-status" data-value="reading"><i class="bi bi-book-half"></i>Reading</button>
              <button class="segment segment-done" type="button" data-action="filter-status" data-value="done"><i class="bi bi-check-circle-fill"></i>Done</button>
            </div>
            <div class="segmented segmented-subtle" role="group" aria-label="Filter by difficulty">
              <button class="segment is-active" type="button" data-action="filter-difficulty" data-value="all">Any level</button>
              <button class="segment segment-beginner" type="button" data-action="filter-difficulty" data-value="beginner">Beginner</button>
              <button class="segment segment-intermediate" type="button" data-action="filter-difficulty" data-value="intermediate">Intermediate</button>
              <button class="segment segment-advanced" type="button" data-action="filter-difficulty" data-value="advanced">Advanced</button>
            </div>
          </div>
        </header>
        <div class="question-list" id="questionList"></div>
      </section>

      <section class="reader-pane" id="readerPane" aria-label="Question reader">
        <div class="reader-empty" id="readerEmpty">
          <div class="reader-empty-icon"><i class="bi bi-cursor-text"></i></div>
          <h2>Choose a question to study</h2>
          <p>The answer, key points and example code open here with plenty of room. Use J and K to move through the list.</p>
        </div>
        <div class="reader-content" id="readerContent" hidden></div>
      </section>

    </div>
  </main>
</div>

<nav class="mobile-nav" id="mobileNav" aria-label="Quick actions">
  <div class="mobile-nav-inner">
    <button class="mobile-nav-button" type="button" data-action="toggle-rail">
      <i class="bi bi-journals"></i><span>Topics</span>
    </button>
    <button class="mobile-nav-button" type="button" data-action="focus-search">
      <i class="bi bi-search"></i><span>Search</span>
    </button>
    <button class="mobile-nav-button mobile-nav-add" id="navAddQuestion" type="button" data-action="add-question" hidden>
      <i class="bi bi-plus-lg"></i><span>Add question</span>
    </button>
    <button class="mobile-nav-button" type="button" data-action="add-topic">
      <i class="bi bi-folder-plus"></i><span>Add topic</span>
    </button>
  </div>
</nav>

<div class="modal fade" id="topicModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="topicModalTitle">Add topic</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="topicIdField">
        <div class="mb-3">
          <label class="form-label" for="topicNameField">Topic name</label>
          <input id="topicNameField" class="form-control" placeholder="For example, Python core" required>
        </div>
        <div class="row g-3">
          <div class="col-6">
            <label class="form-label" for="topicIconField">Bootstrap icon class</label>
            <input id="topicIconField" class="form-control" placeholder="bi-folder" value="bi-folder">
          </div>
          <div class="col-6">
            <label class="form-label" for="topicColorField">Colour</label>
            <input id="topicColorField" class="form-control form-control-color-field" type="color" value="#e92a7c">
          </div>
        </div>
        <div class="mt-3">
          <label class="form-label" for="topicOrderField">Sort order</label>
          <input id="topicOrderField" class="form-control" type="number" value="0">
        </div>
      </div>
      <div class="modal-footer">
        <button class="button button-ghost" type="button" data-bs-dismiss="modal">Cancel</button>
        <button class="button button-primary" type="button" data-action="save-topic">Save topic</button>
      </div>
    </div>
  </div>
</div>

<div class="modal fade" id="questionModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="questionModalTitle">Add question</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="questionIdField">
        <input type="hidden" id="questionTopicField">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label" for="questionTextField">Question</label>
            <textarea id="questionTextField" class="form-control" rows="1" placeholder="Enter the interview question" required></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Answer <span class="label-hint">Code blocks are highlighted using the language chosen below</span></label>
            <div class="editor-shell" id="answerEditorShell">
              <div id="answerEditor"></div>
            </div>
          </div>
          <div class="col-12">
            <label class="form-label" for="questionPointsField">Key points <span class="label-hint">One per line</span></label>
            <textarea id="questionPointsField" class="form-control" rows="5" placeholder="Point one&#10;Point two&#10;Point three"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Example code</label>
            <div class="code-editor-shell" id="codeEditorShell"></div>
          </div>
          <div class="col-md-4">
            <label class="form-label" for="questionLanguageField">Language</label>
            <select id="questionLanguageField" class="form-select" data-action="change-language">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="php">PHP</option>
              <option value="sql">SQL</option>
              <option value="bash">Bash</option>
              <option value="java">Java</option>
              <option value="text">Plain text</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label" for="questionDifficultyField">Difficulty</label>
            <select id="questionDifficultyField" class="form-select">
              <option value="beginner">Beginner</option>
              <option value="intermediate" selected>Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label" for="questionOrderField">Sort order</label>
            <input id="questionOrderField" class="form-control" type="number" value="0">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="button button-ghost" type="button" data-bs-dismiss="modal">Cancel</button>
        <button class="button button-primary" type="button" data-action="save-question">Save question</button>
      </div>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/php.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/bash.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/java.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/php/php.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/shell/shell.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
<script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script>
<script src="scripts.js"></script>
</body>
</html>