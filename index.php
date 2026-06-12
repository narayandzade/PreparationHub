<?php require_once 'database.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Interview Preparation</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css">
<link href="https://cdn.quilljs.com/1.3.7/quill.snow.css" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<!--Start of Tawk.to Script-->
<script type="text/javascript">
  var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
  (function(){
  var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
  s1.async=true;
  s1.src='https://embed.tawk.to/6a2b77358705f01c3509ad02/1jqssjaou';
  s1.charset='UTF-8';
  s1.setAttribute('crossorigin','*');
  s0.parentNode.insertBefore(s1,s0);
  })();
</script>
<!--End of Tawk.to Script-->
</head>
<body>

<div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>

<div class="topbar">
  <button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()" aria-label="Toggle Topics">
    <i class="bi bi-list"></i>
  </button>
  <div class="topbar-brand">
    <div class="brand-icon"><i class="bi bi-mortarboard-fill"></i></div>
    <span class="brand-text">Interview Preparation</span>
  </div>
  <div class="topbar-search">
    <i class="bi bi-search si"></i>
    <input id="searchInput" type="text" placeholder="Search questions…" autocomplete="off">
  </div>
  <div class="topbar-actions">
    <button class="btn-add" onclick="openAddQuestion()" id="topAddQBtn" style="display:none" title="Add Question">
      <i class="bi bi-plus-lg"></i><span class="btn-label"> Add Q</span>
    </button>
    <button class="btn-icon" onclick="openAddTopic()" title="Add Topic">
      <i class="bi bi-folder-plus"></i>
    </button>
  </div>
</div>

<div class="layout">

  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Topics</span>
      <button class="btn-icon sm" onclick="openAddTopic()" title="New Topic"><i class="bi bi-plus"></i></button>
    </div>
    <div class="sidebar-list" id="topicList"></div>
  </div>

  <div class="main">
    <div id="mainHeader" class="main-header" style="display:none">
      <div class="main-title-row">
        <button class="back-btn" id="backBtn" onclick="closeSidebar()" title="Topics">
          <i class="bi bi-chevron-left"></i>
        </button>
        <div class="main-title">
          <span id="mainIcon" style="margin-right:8px"></span>
          <span id="mainTitle"></span>
        </div>
      </div>
    </div>

    <div id="filterRow" class="filter-row" style="display:none">
      <div class="filter-scroll-inner">
        <button class="diff-pill active" data-f="all"         onclick="filterQuestions('all',this)">All</button>
        <button class="diff-pill beg"   data-f="beginner"     onclick="filterQuestions('beginner',this)">Beginner</button>
        <button class="diff-pill int"   data-f="intermediate" onclick="filterQuestions('intermediate',this)">Intermediate</button>
        <button class="diff-pill adv"   data-f="advanced"     onclick="filterQuestions('advanced',this)">Advanced</button>
        <div class="filter-divider"></div>
        <button class="status-pill sp-new active" data-s="all" onclick="filterByStatus('all',this)">
          <i class="bi bi-circle"></i> All
        </button>
        <button class="status-pill sp-new" data-s="new" onclick="filterByStatus('new',this)">
          <i class="bi bi-circle"></i> New
        </button>
        <button class="status-pill sp-reading" data-s="reading" onclick="filterByStatus('reading',this)">
          <i class="bi bi-book-half"></i> Reading
        </button>
        <button class="status-pill sp-done" data-s="done" onclick="filterByStatus('done',this)">
          <i class="bi bi-check-circle-fill"></i> Done
        </button>
        <button class="btn-add filter-add-btn" id="addQBtn" onclick="openAddQuestion()" style="display:none">
          <i class="bi bi-plus-lg"></i><span> Add Question</span>
        </button>
      </div>
    </div>

    <div id="welcomeScreen" class="welcome">
      <div class="welcome-icon"><i class="bi bi-journal-bookmark"></i></div>
      <h2>Interview Preparation </h2>
      <p>Tap <strong><i class="bi bi-list"></i> Topics</strong> to pick a topic, or add a new one to get started.</p>
      <button class="btn-add" onclick="toggleSidebar()" style="margin-top:8px">
        <i class="bi bi-layout-sidebar"></i> Browse Topics
      </button>
    </div>

    <div id="qScroll" class="q-scroll" style="display:none"></div>
  </div>
</div>

<nav class="mobile-bottom-nav" id="mobileBottomNav">
  <div class="mobile-bottom-nav-inner">
  <button class="mbn-btn" onclick="toggleSidebar()">
    <i class="bi bi-journals"></i>
    <span>Topics</span>
  </button>
  <button class="mbn-btn" id="mbnSearch" onclick="focusSearch()">
    <i class="bi bi-search"></i>
    <span>Search</span>
  </button>
  <button class="mbn-btn mbn-add" onclick="openAddQuestion()" id="mbnAddQ" style="display:none">
    <i class="bi bi-plus-lg"></i>
    <span>Add Q</span>
  </button>
  <button class="mbn-btn" onclick="openAddTopic()">
    <i class="bi bi-folder-plus"></i>
    <span>Add Topic</span>
  </button>
  </div>
</nav>

<div class="modal fade" id="topicModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="topicModalTitle">Add Topic</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="topicId">
        <div class="mb-3">
          <label class="form-label">Topic Name</label>
          <input id="topicName" class="form-control" placeholder="e.g. Python Core" required>
        </div>
        <div class="row g-3">
          <div class="col-6">
            <label class="form-label">Bootstrap Icon Class</label>
            <input id="topicIcon" class="form-control" placeholder="bi-folder" value="bi-folder">
          </div>
          <div class="col-6">
            <label class="form-label">Color</label>
            <input id="topicColor" class="form-control" type="color" value="#3b6ef5" style="height:42px;padding:4px 8px">
          </div>
        </div>
        <div class="mt-3">
          <label class="form-label">Sort Order</label>
          <input id="topicOrder" class="form-control" type="number" value="0">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" data-bs-dismiss="modal">Cancel</button>
        <button class="btn-primary-custom" onclick="saveTopic()">Save Topic</button>
      </div>
    </div>
  </div>
</div>

<div class="modal fade" id="qModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="qModalTitle">Add Question</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="qId">
        <input type="hidden" id="qTopicId">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label">Question</label>
            <textarea id="qQuestion" class="form-control" rows="1" placeholder="Enter the interview question…" required></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Answer</label>
            <div id="quillAnswerWrapper">
              <div id="quillAnswerEditor"></div>
            </div>
            <textarea id="qAnswer" style="display:none"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Key Points <span class="label-hint">(one per line)</span></label>
            <textarea id="qPoints" class="form-control" rows="5" placeholder="Point one&#10;Point two&#10;Point three"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Example Code</label>
            <div id="codeEditorWrapper" style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:#1a1e2d;"></div>
            <textarea id="qCode" style="display:none"></textarea>
          </div>
           <div class="col-md-4">
            <label class="form-label">Language</label>
            <select id="qLang" class="form-select" onchange="updateEditorMode()">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="php">PHP</option>
              <option value="sql">SQL</option>
              <option value="bash">Bash</option>
              <option value="java">Java</option>
              <option value="text">Plain Text</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Difficulty</label>
            <select id="qDifficulty" class="form-select">
              <option value="beginner">Beginner</option>
              <option value="intermediate" selected>Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Sort Order</label>
            <input id="qOrder" class="form-control" type="number" value="0">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" data-bs-dismiss="modal">Cancel</button>
        <button class="btn-primary-custom" onclick="saveQuestion()">Save Question</button>
      </div>
    </div>
  </div>
</div>
<!-- Developer Watermark -->
<div class="dev-watermark">
  <div class="dev-wm-inner">
   <div class="dev-wm-avatar"><i class="fa-solid fa-code"></i></div>
    <div class="dev-wm-info">
      <span class="dev-wm-name">Narayan Zade</span>
      <span class="dev-wm-role"><i class="bi bi-braces"></i> Python Developer</span>
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
<script>
function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const b = document.getElementById('sidebarBackdrop');
  const open = s.classList.toggle('open');
  b.classList.toggle('visible', open);
  document.body.classList.toggle('sidebar-open', open);
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
  document.body.classList.remove('sidebar-open');
}
function focusSearch() {
  const inp = document.getElementById('searchInput');
  inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  inp.focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
</script>
<script src="scripts.js"></script>
</body>
</html>