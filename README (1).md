# ⚡ Taskflow — Smart To-Do List & Calendar

A modern productivity web app built with **pure HTML, CSS & Vanilla JavaScript** — no frameworks, no backend. Just open `index.html`.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## 🚀 Getting Started

```bash
git clone https://github.com/your-username/taskflow.git
cd taskflow
open index.html
```

For browser notifications, serve locally:
```bash
python3 -m http.server 3000
# then visit http://localhost:3000
```

**GitHub Pages:** Settings → Pages → Source → main / root → done.

---

## ✨ Features

- **Tasks** — Add, edit, delete, complete · Priority (High/Medium/Low) · Categories · Due dates · Drag-and-drop reorder
- **Dashboard** — Stats cards (click to filter), progress bar, today's tasks, activity feed
- **Calendar** — FullCalendar integration, tasks shown by due date, click date to add task
- **Routines** — Auto-add tasks daily, alarm-style on/off toggle, interval reminders (e.g. drink water every 2h), custom active days & time windows
- **Notifications** — Browser push notifications + in-app toasts for reminders
- **Search & Filters** — Filter by status, priority, category
- **Dark Mode** — Persisted across sessions
- **Local Storage** — All data saved in browser, no account needed

---

## 📁 Files

```
taskflow/
├── index.html    # App structure & modals
├── style.css     # All styles + dark theme
└── script.js     # All logic + routines engine
```

---

## 📦 Dependencies (CDN — no install needed)

| Library | Purpose |
|---|---|
| FullCalendar 6.1.10 | Calendar view |
| SortableJS 1.15.2 | Drag-and-drop |
| Font Awesome 6.5.0 | Icons |
| Google Fonts | Syne + DM Sans |

---

## ⌨️ Shortcuts

| Key | Action |
|---|---|
| `Ctrl/Cmd + N` | New task |
| `Escape` | Close modal |

---

## 📄 License

MIT — free to use and modify.
