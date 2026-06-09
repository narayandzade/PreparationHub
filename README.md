# 📚 Interview Prep Hub

A clean, full-stack **PHP + MySQL** single-page application for organizing and practicing interview questions by topic, difficulty, and practice status.

---

## ✨ Features

- **Topic management** — add, edit, delete topics with custom icons and colors
- **Question management** — full CRUD with answer, key points, code examples, and difficulty levels
- **Practice status tracking** — cycle questions through `New → Reading → Done` with animated transitions
- **Progress bar** — per-topic completion progress shown live in the sidebar
- **Difficulty filters** — filter by Beginner / Intermediate / Advanced
- **Status filters** — filter by New / Reading / Done
- **Global search** — search questions across all topics instantly
- **Syntax highlighting** — code examples highlighted via Highlight.js (Python, JS, PHP, SQL, Bash, Java)
- **CodeMirror editor** — syntax-aware code editor inside the question form
- **Auto DB backup** — on every page load, a fresh `preparation_backup.sql` is written to the project folder
- **LocalStorage state** — active topic, filters, scroll position, and question statuses all persist across reloads
- **Responsive** — works on desktop and mobile

---

## 🛠 Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | PHP 8.x (single `backend.php` REST API) |
| Database | MySQL / MariaDB |
| Frontend | Vanilla JS, Bootstrap 5.3, Bootstrap Icons |
| Editor   | CodeMirror 5 (Dracula theme) |
| Syntax   | Highlight.js (atom-one-dark theme) |
| Alerts   | SweetAlert2 |
| Fonts    | Nunito, Fira Code (Google Fonts) |

---

## 📁 Project Structure

```
interview-prep-hub/
├── index.php           # Entry point (triggers backup, renders SPA shell)
├── backend.php         # REST API — all CRUD + status update + search
├── database.php        # PDO connection
├── backup.php          # Auto DB backup on every page load
├── scripts.js          # All frontend logic (topics, questions, status, search)
├── style.css           # All styles, animations, status badges
└── preparation_backup.sql  # Auto-generated — latest DB backup (git-ignored)
```

---

## ⚙️ Setup

### Requirements
- PHP 8.0+
- MySQL 5.7+ / MariaDB 10.4+
- XAMPP / MAMP / Laravel Herd or any local PHP server

### Steps

**1. Clone the repo**
```bash
git clone https://github.com/narayandzade/interview-prep-hub.git
cd interview-prep-hub
```

**2. Import the database**
```bash
mysql -u root -p < preparation_backup.sql
```
Or import via phpMyAdmin: create a database named `preparation` and import `preparation_backup.sql`.

**3. Configure DB credentials**

Edit `database.php` if your credentials differ:
```php
$host = 'localhost';
$db   = 'preparation';
$user = 'root';
$pass = '';
```

**4. Serve the project**

Place the folder in your XAMPP `htdocs` (or MAMP `htdocs`) directory and open:
```
http://localhost/interview-prep-hub/
```

---

## 🔄 Auto Backup

Every page load triggers `backup.php` which:
1. Tries `mysqldump` (auto-detects path for XAMPP/MAMP/Homebrew/Linux)
2. Falls back to a pure-PHP PDO dump if `mysqldump` is unavailable
3. Overwrites `preparation_backup.sql` — always one fresh backup, no accumulation
4. Logs result to `backup.log`

---

## 📸 Practice Status Flow

```
⚪ New  →  📖 Reading  →  ✅ Done  →  ⚪ New
```

Click the status badge on any question card to cycle through. Status is saved to both **localStorage** (instant) and **MySQL** (async).

---

## 📄 License

MIT — free to use and modify.
