/* ========================================
   TASKFLOW — script.js
   Smart To-Do List with Calendar
   ======================================== */

// ==========================================
// STATE & STORAGE
// ==========================================

/** Default categories with colors */
const DEFAULT_CATEGORIES = [
  { id: 'personal', name: 'Personal', color: '#6366f1' },
  { id: 'study',    name: 'Study',    color: '#f59e0b' },
  { id: 'work',     name: 'Work',     color: '#3b82f6' },
  { id: 'health',   name: 'Health',   color: '#10b981' },
];

/** Color palette for custom categories */
const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#84cc16',
  '#10b981','#06b6d4','#3b82f6','#6366f1',
  '#8b5cf6','#ec4899','#64748b','#0ea5e9',
];

/** App state — single source of truth */
let state = {
  tasks:      [],
  categories: [...DEFAULT_CATEGORIES],
  theme:      'light',
  activity:   [],     // recent activity log
  nextId:     1,
  routines:   [],     // daily routine templates
};

/** Load persisted state from localStorage */
function loadState() {
  try {
    const saved = localStorage.getItem('taskflow_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
    }
  } catch (e) {
    console.warn('Could not load saved state:', e);
  }
}

/** Save current state to localStorage */
function saveState() {
  try {
    localStorage.setItem('taskflow_state', JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state:', e);
  }
}

// ==========================================
// UTILITY HELPERS
// ==========================================

/** Format a date string (YYYY-MM-DD) to a readable label */
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Today's date as YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Check if a date string is today */
function isToday(dateStr) {
  return dateStr === todayStr();
}

/** Check if a date string is in the past (overdue) */
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return dateStr < todayStr();
}

/** Check if a date is upcoming (within next 7 days, not today or past) */
function isUpcoming(dateStr) {
  if (!dateStr) return false;
  const today = todayStr();
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  const limitStr = limit.toISOString().slice(0, 10);
  return dateStr > today && dateStr <= limitStr;
}

/** Get a category object by ID */
function getCategory(id) {
  return state.categories.find(c => c.id === id) || null;
}

/** Generate a unique ID */
function genId() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/** Relative time label (e.g. "2 minutes ago") */
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min}m ago`;
  if (hr < 24)   return `${hr}h ago`;
  return `${day}d ago`;
}

/** Add an entry to the activity log (max 20) */
function logActivity(text, color) {
  state.activity.unshift({ text, color, ts: Date.now() });
  if (state.activity.length > 20) state.activity.pop();
  saveState();
}

// ==========================================
// GREETING
// ==========================================

function setGreeting() {
  const hour = new Date().getHours();
  let greet = 'Good morning! 👋';
  if (hour >= 12 && hour < 17) greet = 'Good afternoon! ☀️';
  else if (hour >= 17)          greet = 'Good evening! 🌙';
  document.getElementById('greetingText').textContent = greet;
  document.getElementById('greetingDate').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ==========================================
// THEME
// ==========================================

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (theme === 'dark') {
    icon.className  = 'fa-solid fa-sun';
    label.textContent = 'Light Mode';
  } else {
    icon.className  = 'fa-solid fa-moon';
    label.textContent = 'Dark Mode';
  }
  saveState();
}

document.getElementById('themeToggle').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// ==========================================
// SIDEBAR / NAVIGATION
// ==========================================

// Sidebar open/close on mobile
const sidebar        = document.getElementById('sidebar');
const hamburger      = document.getElementById('hamburger');
const sidebarClose   = document.getElementById('sidebarClose');

// Create overlay element for mobile sidebar backdrop
const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

function openSidebar()  { sidebar.classList.add('open');  overlay.classList.add('active'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('active'); }

hamburger.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

/** Switch visible view and highlight nav item */
function switchView(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  // Show target view
  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewName);
  });

  // Update topbar title
  const titles = { dashboard: 'Dashboard', tasks: 'All Tasks', today: "Today", upcoming: 'Upcoming', calendar: 'Calendar', routines: 'Routines' };
  document.getElementById('topbarTitle').textContent = titles[viewName] || 'Taskflow';

  // Render the view
  renderView(viewName);
  closeSidebar();
}

// Nav item clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    switchView(item.dataset.view);
  });
});

// "See all" dashboard links
document.querySelectorAll('.see-all').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    switchView(link.dataset.view);
  });
});

/** Render whichever view just became active */
function renderView(view) {
  switch (view) {
    case 'dashboard': renderDashboard();  break;
    case 'tasks':     renderAllTasks();   break;
    case 'today':     renderToday();      break;
    case 'upcoming':  renderUpcoming();   break;
    case 'calendar':  renderCalendar();   break;
    case 'routines':  renderRoutines();   break;
  }
}

// ==========================================
// STATS & PROGRESS
// ==========================================

function updateStats() {
  const total     = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const pending   = total - completed;
  const overdue   = state.tasks.filter(t => !t.completed && isOverdue(t.due)).length;
  const pct       = total === 0 ? 0 : Math.round((completed / total) * 100);

  document.getElementById('statTotal').textContent     = total;
  document.getElementById('statCompleted').textContent = completed;
  document.getElementById('statPending').textContent   = pending;
  document.getElementById('statOverdue').textContent   = overdue;
  document.getElementById('progressPercent').textContent = pct + '%';
  document.getElementById('progressBarFill').style.width  = pct + '%';
}

/**
 * Wire up stat card clicks — each card navigates to All Tasks
 * with the appropriate filter pre-applied.
 * Called once during init().
 */
function initStatCardClicks() {
  // Map: card element id → { status, label }
  const cardMeta = {
    'statTotal':     { status: 'all',       priority: 'all', label: 'All Tasks'       },
    'statCompleted': { status: 'completed',  priority: 'all', label: 'Completed Tasks' },
    'statPending':   { status: 'pending',    priority: 'all', label: 'Pending Tasks'   },
    'statOverdue':   { status: 'overdue',    priority: 'all', label: 'Overdue Tasks'   },
  };

  Object.entries(cardMeta).forEach(([id, meta]) => {
    // The number span is inside .stat-card — walk up to find the card
    const numEl = document.getElementById(id);
    if (!numEl) return;
    const card = numEl.closest('.stat-card');
    if (!card) return;

    card.style.cursor = 'pointer';
    card.setAttribute('title', `View ${meta.label}`);

    card.addEventListener('click', () => {
      // Reset all filters first
      document.getElementById('filterStatus').value   = 'all';
      document.getElementById('filterPriority').value = 'all';
      document.getElementById('filterCategory').value = 'all';
      document.getElementById('globalSearch').value   = '';

      if (meta.status === 'overdue') {
        // No native filter for overdue — use pending + let renderAllTasks
        // show them; we set a custom flag instead
        document.getElementById('filterStatus').value = 'pending';
        // Store overdue flag so renderAllTasks can use it
        state._filterOverdue = true;
      } else {
        state._filterOverdue = false;
        document.getElementById('filterStatus').value = meta.status;
      }

      switchView('tasks');
    });
  });
}

// ==========================================
// CATEGORY SIDEBAR RENDERING
// ==========================================

function renderCategorySidebar() {
  const list = document.getElementById('categoryList');
  list.innerHTML = '';

  state.categories.forEach(cat => {
    const count = state.tasks.filter(t => t.category === cat.id).length;
    const item  = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <span class="cat-dot" style="background:${cat.color}"></span>
      <span>${cat.name}</span>
      <span class="cat-count">${count}</span>
    `;
    item.addEventListener('click', () => {
      // Filter by this category in All Tasks view
      document.getElementById('filterCategory').value = cat.id;
      switchView('tasks');
    });
    list.appendChild(item);
  });

  // Also refresh the category selects in the filter bar + task modal
  populateCategorySelects();
}

/** Populate all <select> elements for categories */
function populateCategorySelects() {
  // Filter bar
  const filterSel = document.getElementById('filterCategory');
  const current   = filterSel.value;
  filterSel.innerHTML = '<option value="all">All</option>';
  state.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    filterSel.appendChild(opt);
  });
  filterSel.value = current || 'all';

  // Task modal
  const taskSel = document.getElementById('taskCategory');
  taskSel.innerHTML = '';
  state.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    taskSel.appendChild(opt);
  });

  // Routine modal
  const routineSel = document.getElementById('routineCategory');
  if (routineSel) {
    routineSel.innerHTML = '';
    state.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      routineSel.appendChild(opt);
    });
  }
}

// ==========================================
// TASK CARD BUILDER
// ==========================================

/**
 * Build a task card DOM element.
 * @param {Object} task
 * @param {boolean} compact - hide description to save space
 */
function buildTaskCard(task, compact = false) {
  const cat     = getCategory(task.category);
  const overdue = !task.completed && isOverdue(task.due);

  const card = document.createElement('div');
  card.className = `task-card priority-${task.priority} ${task.completed ? 'completed' : ''}`;
  card.dataset.id = task.id;

  // Priority badge HTML
  const priorityLabel = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };

  // Due date badge
  let dueBadge = '';
  if (task.due) {
    const cls = overdue ? 'badge-overdue' : 'badge-due';
    const ico = overdue ? '<i class="fa-solid fa-circle-exclamation"></i>' : '<i class="fa-regular fa-calendar"></i>';
    dueBadge = `<span class="badge ${cls}">${ico} ${formatDate(task.due)}</span>`;
  }

  card.innerHTML = `
    <span class="drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
    <div class="task-check ${task.completed ? 'checked' : ''}" data-id="${task.id}"></div>
    <div class="task-content">
      <div class="task-title-row">
        <span class="task-name">${escHtml(task.title)}</span>
      </div>
      ${!compact && task.description ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="badge badge-${task.priority}">${priorityLabel[task.priority]}</span>
        ${cat ? `<span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}"><i class="fa-solid fa-tag"></i> ${cat.name}</span>` : ''}
        ${dueBadge}
      </div>
    </div>
    <div class="task-actions">
      <button class="task-btn view-btn" title="View details" data-id="${task.id}"><i class="fa-solid fa-eye"></i></button>
      <button class="task-btn edit-btn" title="Edit" data-id="${task.id}"><i class="fa-solid fa-pen"></i></button>
      <button class="task-btn del" title="Delete" data-id="${task.id}"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;

  // Checkbox toggle
  card.querySelector('.task-check').addEventListener('click', e => {
    e.stopPropagation();
    toggleComplete(task.id);
  });

  // View detail
  card.querySelector('.view-btn').addEventListener('click', e => {
    e.stopPropagation();
    openDetailModal(task.id);
  });

  // Edit
  card.querySelector('.edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openTaskModal(task.id);
  });

  // Delete
  card.querySelector('.del').addEventListener('click', e => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  return card;
}

/** Escape HTML special chars to prevent XSS */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render a list of tasks into a container, showing empty state if needed */
function renderTaskList(container, tasks, compact = false) {
  container.innerHTML = '';
  if (!tasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>No tasks here</h3>
        <p>Add a new task to get started!</p>
      </div>`;
    return;
  }
  tasks.forEach(t => container.appendChild(buildTaskCard(t, compact)));
}

// ==========================================
// DASHBOARD RENDER
// ==========================================

function renderDashboard() {
  updateStats();
  renderCategorySidebar();

  // Today's tasks panel (compact)
  const todayTasks = state.tasks.filter(t => isToday(t.due));
  renderTaskList(document.getElementById('dashTodayList'), todayTasks, true);

  // Activity feed
  renderActivity();
}

function renderActivity() {
  const list = document.getElementById('activityList');
  list.innerHTML = '';

  if (!state.activity.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🕐</div><h3>No activity yet</h3><p>Actions will appear here.</p></div>`;
    return;
  }

  state.activity.slice(0, 10).forEach(a => {
    const el = document.createElement('div');
    el.className = 'activity-item';
    el.innerHTML = `
      <span class="activity-dot" style="background:${a.color || '#6366f1'}"></span>
      <span class="activity-text">${escHtml(a.text)}</span>
      <span class="activity-time">${relativeTime(a.ts)}</span>
    `;
    list.appendChild(el);
  });
}

// ==========================================
// ALL TASKS VIEW
// ==========================================

function renderAllTasks() {
  const tasks = getFilteredTasks();
  const container = document.getElementById('allTasksList');

  // Show a filter banner above the list when a stat-card filter is active
  updateFilterBanner();

  renderTaskList(container, tasks);

  // Initialize SortableJS for drag-and-drop reordering
  if (container._sortable) container._sortable.destroy();
  container._sortable = new Sortable(container, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd(evt) {
      // Reorder state.tasks based on new DOM order
      const ids = [...container.querySelectorAll('.task-card')].map(c => c.dataset.id);
      const taskMap = {};
      state.tasks.forEach(t => { taskMap[t.id] = t; });
      // Preserve non-visible tasks, reorder visible ones
      const visibleIds   = new Set(ids);
      const invisible    = state.tasks.filter(t => !visibleIds.has(t.id));
      const reordered    = ids.map(id => taskMap[id]).filter(Boolean);
      state.tasks = [...reordered, ...invisible];
      saveState();
    },
  });
}

/** Show/hide a pill banner in the All Tasks view indicating the active quick-filter */
function updateFilterBanner() {
  // Remove old banner if any
  const old = document.getElementById('filterBanner');
  if (old) old.remove();

  const statusVal   = document.getElementById('filterStatus').value;
  const overdueOnly = state._filterOverdue === true;

  let label = null;
  let icon  = '';
  let color = '';

  if (overdueOnly) {
    label = 'Overdue Tasks';  icon = 'fa-triangle-exclamation'; color = 'var(--high)';
  } else if (statusVal === 'completed') {
    label = 'Completed Tasks'; icon = 'fa-circle-check';        color = 'var(--low)';
  } else if (statusVal === 'pending') {
    label = 'Pending Tasks';   icon = 'fa-hourglass-half';      color = 'var(--medium)';
  }

  if (!label) return; // "All" — no banner needed

  const banner = document.createElement('div');
  banner.id = 'filterBanner';
  banner.style.cssText = `
    display:flex; align-items:center; gap:10px;
    margin-bottom:14px; padding:10px 16px;
    background:color-mix(in srgb, ${color} 12%, transparent);
    border:1px solid color-mix(in srgb, ${color} 30%, transparent);
    border-radius:var(--radius-sm); font-size:0.88rem; font-weight:600;
    color:${color}; animation: cardIn 0.2s ease;
  `;
  banner.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>Showing: ${label}</span>
    <button onclick="clearStatFilter()" style="
      margin-left:auto; background:none; border:none; cursor:pointer;
      color:${color}; font-size:0.8rem; display:flex; align-items:center; gap:5px;
      font-family:var(--font-body); font-weight:600; opacity:0.8;
    "><i class="fa-solid fa-xmark"></i> Clear</button>
  `;

  // Insert before the task list
  const container = document.getElementById('allTasksList');
  container.parentNode.insertBefore(banner, container);
}

/** Called by the banner's Clear button */
function clearStatFilter() {
  document.getElementById('filterStatus').value   = 'all';
  document.getElementById('filterPriority').value = 'all';
  document.getElementById('filterCategory').value = 'all';
  state._filterOverdue = false;
  renderAllTasks();
}

/** Build filtered task list based on filter bar values */
function getFilteredTasks(searchOverride) {
  const statusVal   = document.getElementById('filterStatus').value;
  const priorityVal = document.getElementById('filterPriority').value;
  const catVal      = document.getElementById('filterCategory').value;
  const search      = searchOverride ?? document.getElementById('globalSearch').value.trim().toLowerCase();
  const overdueOnly = state._filterOverdue === true;

  return state.tasks.filter(t => {
    // Overdue shortcut: pending + has a past due date
    if (overdueOnly) {
      if (t.completed || !isOverdue(t.due)) return false;
    } else {
      if (statusVal === 'completed' && !t.completed) return false;
      if (statusVal === 'pending'   && t.completed)  return false;
    }
    if (priorityVal !== 'all' && t.priority !== priorityVal) return false;
    if (catVal !== 'all' && t.category !== catVal)           return false;
    if (search && !t.title.toLowerCase().includes(search) &&
        !t.description.toLowerCase().includes(search))       return false;
    return true;
  });
}

// Filter change listeners
['filterStatus', 'filterPriority', 'filterCategory'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    state._filterOverdue = false; // manual change clears overdue shortcut
    if (document.getElementById('view-tasks').classList.contains('active')) renderAllTasks();
  });
});

document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('filterStatus').value   = 'all';
  document.getElementById('filterPriority').value = 'all';
  document.getElementById('filterCategory').value = 'all';
  document.getElementById('globalSearch').value   = '';
  state._filterOverdue = false;
  renderAllTasks();
});

// Global search
document.getElementById('globalSearch').addEventListener('input', () => {
  if (document.getElementById('view-tasks').classList.contains('active')) renderAllTasks();
});

// ==========================================
// TODAY VIEW
// ==========================================

function renderToday() {
  const tasks = state.tasks.filter(t => isToday(t.due));
  renderTaskList(document.getElementById('todayTasksList'), tasks);
}

// ==========================================
// UPCOMING VIEW
// ==========================================

function renderUpcoming() {
  const container = document.getElementById('upcomingTasksList');
  container.innerHTML = '';

  // Group by date for the next 7 days
  const pending = state.tasks.filter(t => !t.completed && t.due && t.due >= todayStr());
  pending.sort((a, b) => a.due.localeCompare(b.due));

  if (!pending.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div><h3>All clear!</h3><p>No upcoming tasks.</p></div>`;
    return;
  }

  // Group by date
  const groups = {};
  pending.forEach(t => {
    if (!groups[t.due]) groups[t.due] = [];
    groups[t.due].push(t);
  });

  Object.keys(groups).sort().forEach(dateKey => {
    const group = document.createElement('div');
    group.className = 'upcoming-group';

    let label = formatDate(dateKey);
    if (isToday(dateKey)) label = '📅 Today — ' + label;
    else if (dateKey === new Date(Date.now() + 86400000).toISOString().slice(0,10)) label = '⏰ Tomorrow — ' + label;

    group.innerHTML = `<div class="upcoming-group-label">${label}</div>`;
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    groups[dateKey].forEach(t => taskList.appendChild(buildTaskCard(t)));
    group.appendChild(taskList);
    container.appendChild(group);
  });
}

// ==========================================
// CALENDAR VIEW
// ==========================================

let calendarInstance = null;

function renderCalendar() {
  const el = document.getElementById('calendarEl');

  // Build events from tasks that have due dates
  const events = state.tasks
    .filter(t => t.due)
    .map(t => ({
      id:        t.id,
      title:     t.title,
      start:     t.due,
      classNames: [`priority-${t.priority}`, t.completed ? 'fc-event-completed' : ''],
      extendedProps: { taskId: t.id },
    }));

  if (calendarInstance) {
    // Refresh events instead of rebuilding
    calendarInstance.removeAllEvents();
    calendarInstance.addEventSource(events);
    return;
  }

  calendarInstance = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left:   'prev,next today',
      center: 'title',
      right:  'dayGridMonth,timeGridWeek,listWeek',
    },
    height: 'auto',
    events,
    eventClick(info) {
      // Show task detail when clicking a calendar event
      openDetailModal(info.event.extendedProps.taskId);
    },
    dateClick(info) {
      // Pre-fill due date when clicking a calendar date
      openTaskModal(null, info.dateStr);
    },
    eventDidMount(info) {
      // Tooltip showing full title
      info.el.title = info.event.title;
    },
  });

  calendarInstance.render();
}

// ==========================================
// TASK MODAL (Add / Edit)
// ==========================================

let editingTaskId = null;

/** Open the task modal.
 * @param {string|null} taskId — if set, we're editing; null = new task
 * @param {string|null} prefilledDate — pre-fill due date (from calendar click)
 */
function openTaskModal(taskId = null, prefilledDate = null) {
  editingTaskId = taskId;
  const modal    = document.getElementById('taskModal');
  const title    = document.getElementById('modalTitle');

  // Reset form
  document.getElementById('taskTitle').value    = '';
  document.getElementById('taskDesc').value     = '';
  document.getElementById('taskDue').value      = prefilledDate || '';
  document.getElementById('taskPriority').value = 'medium';

  populateCategorySelects();

  if (taskId) {
    // Editing existing task — populate form
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    title.textContent = 'Edit Task';
    document.getElementById('taskTitle').value    = task.title;
    document.getElementById('taskDesc').value     = task.description || '';
    document.getElementById('taskDue').value      = task.due || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskCategory').value = task.category;
  } else {
    title.textContent = 'New Task';
    // Default category to first one
    if (state.categories.length) {
      document.getElementById('taskCategory').value = state.categories[0].id;
    }
  }

  modal.classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('open');
  editingTaskId = null;
}

document.getElementById('modalClose').addEventListener('click', closeTaskModal);
document.getElementById('modalCancel').addEventListener('click', closeTaskModal);
document.getElementById('taskModal').addEventListener('click', e => {
  if (e.target === document.getElementById('taskModal')) closeTaskModal();
});

// Save task
document.getElementById('modalSave').addEventListener('click', saveTask);
document.getElementById('taskTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveTask();
});

function saveTask() {
  const title    = document.getElementById('taskTitle').value.trim();
  const desc     = document.getElementById('taskDesc').value.trim();
  const due      = document.getElementById('taskDue').value;
  const priority = document.getElementById('taskPriority').value;
  const category = document.getElementById('taskCategory').value;

  if (!title) {
    showToast('Please enter a task title.', 'warning');
    document.getElementById('taskTitle').focus();
    return;
  }

  if (editingTaskId) {
    // Update existing
    const task = state.tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title       = title;
      task.description = desc;
      task.due         = due;
      task.priority    = priority;
      task.category    = category;
      task.updatedAt   = Date.now();
    }
    logActivity(`Edited: "${title}"`, '#6366f1');
    showToast('Task updated!', 'info');
  } else {
    // Create new
    const newTask = {
      id:          genId(),
      title,
      description: desc,
      due,
      priority,
      category,
      completed:   false,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };
    state.tasks.unshift(newTask);
    logActivity(`Added: "${title}"`, '#10b981');
    showToast('Task added!', 'success');
  }

  saveState();
  closeTaskModal();
  refreshAll();

  // Due-date reminder check (next day tasks)
  checkUpcomingReminders();
}

// ==========================================
// TASK ACTIONS (toggle, delete)
// ==========================================

function toggleComplete(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.completed = !task.completed;
  task.updatedAt = Date.now();

  if (task.completed) {
    logActivity(`Completed: "${task.title}"`, '#10b981');
    showToast('Task completed! 🎉', 'success');
  } else {
    logActivity(`Reopened: "${task.title}"`, '#f59e0b');
    showToast('Task marked as pending.', 'info');
  }

  saveState();
  refreshAll();
}

function deleteTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  logActivity(`Deleted: "${task.title}"`, '#ef4444');
  showToast('Task deleted.', 'error');
  saveState();
  refreshAll();

  // Close detail modal if it was showing this task
  if (document.getElementById('detailModal').classList.contains('open')) {
    closeDetailModal();
  }
}

// ==========================================
// TASK DETAIL MODAL
// ==========================================

let detailTaskId = null;

function openDetailModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  detailTaskId = taskId;

  const cat     = getCategory(task.category);
  const overdue = !task.completed && isOverdue(task.due);
  const body    = document.getElementById('detailBody');
  const priorityLabel = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };

  document.getElementById('detailTitle').textContent = task.title;

  body.innerHTML = `
    ${task.description ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value detail-desc">${escHtml(task.description)}</span></div>` : ''}
    <div class="detail-row">
      <span class="detail-label">Status</span>
      <span class="detail-value">
        <span class="badge ${task.completed ? 'badge-low' : 'badge-medium'}">
          ${task.completed ? '✅ Completed' : '⏳ Pending'}
        </span>
      </span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Priority</span>
      <span class="detail-value"><span class="badge badge-${task.priority}">${priorityLabel[task.priority]}</span></span>
    </div>
    ${cat ? `<div class="detail-row"><span class="detail-label">Category</span><span class="detail-value"><span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}">${cat.name}</span></span></div>` : ''}
    <div class="detail-row">
      <span class="detail-label">Due Date</span>
      <span class="detail-value">
        ${task.due
          ? `<span class="badge ${overdue ? 'badge-overdue' : 'badge-due'}">${overdue ? '⚠️ ' : ''}${formatDate(task.due)}</span>`
          : '<span style="color:var(--text-muted)">No due date</span>'}
      </span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Created</span>
      <span class="detail-value" style="color:var(--text-muted);font-size:0.85rem">${new Date(task.createdAt).toLocaleString()}</span>
    </div>
  `;

  document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  detailTaskId = null;
}

document.getElementById('detailClose').addEventListener('click', closeDetailModal);
document.getElementById('detailModal').addEventListener('click', e => {
  if (e.target === document.getElementById('detailModal')) closeDetailModal();
});

document.getElementById('detailEdit').addEventListener('click', () => {
  const id = detailTaskId;
  closeDetailModal();
  openTaskModal(id);
});

document.getElementById('detailDelete').addEventListener('click', () => {
  if (detailTaskId) deleteTask(detailTaskId);
});

// ==========================================
// ADD TASK BUTTONS (multiple views)
// ==========================================

document.getElementById('topbarAddTask').addEventListener('click', () => openTaskModal());
document.getElementById('tasksAddBtn').addEventListener('click',  () => openTaskModal());
document.getElementById('todayAddBtn').addEventListener('click',  () => {
  openTaskModal(null, todayStr());
});

// ==========================================
// CATEGORY MODAL
// ==========================================

let selectedColor = COLOR_PALETTE[0];

function openCatModal() {
  document.getElementById('catName').value = '';
  selectedColor = COLOR_PALETTE[0];
  buildColorPicker();
  document.getElementById('catModal').classList.add('open');
  document.getElementById('catName').focus();
}

function closeCatModal() {
  document.getElementById('catModal').classList.remove('open');
}

function buildColorPicker() {
  const picker = document.getElementById('colorPicker');
  picker.innerHTML = '';
  COLOR_PALETTE.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color === selectedColor ? ' selected' : '');
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      selectedColor = color;
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    picker.appendChild(swatch);
  });
}

document.getElementById('addCategoryBtn').addEventListener('click', openCatModal);
document.getElementById('catModalClose').addEventListener('click', closeCatModal);
document.getElementById('catCancel').addEventListener('click', closeCatModal);
document.getElementById('catModal').addEventListener('click', e => {
  if (e.target === document.getElementById('catModal')) closeCatModal();
});

document.getElementById('catSave').addEventListener('click', () => {
  const name = document.getElementById('catName').value.trim();
  if (!name) {
    showToast('Please enter a category name.', 'warning');
    return;
  }
  const newCat = {
    id:    genId(),
    name,
    color: selectedColor,
  };
  state.categories.push(newCat);
  saveState();
  closeCatModal();
  renderCategorySidebar();
  showToast(`Category "${name}" added!`, 'success');
});

document.getElementById('catName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('catSave').click();
});

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

const TOAST_ICONS = {
  success: 'fa-circle-check',
  error:   'fa-circle-xmark',
  info:    'fa-circle-info',
  warning: 'fa-triangle-exclamation',
};

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i> ${escHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ==========================================
// UPCOMING REMINDER NOTIFICATIONS
// ==========================================

function checkUpcomingReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const due = state.tasks.filter(t => !t.completed && t.due === tomorrowStr);
  if (due.length === 1) {
    showToast(`⏰ Reminder: "${due[0].title}" is due tomorrow!`, 'warning', 5000);
  } else if (due.length > 1) {
    showToast(`⏰ Reminder: ${due.length} tasks are due tomorrow!`, 'warning', 5000);
  }
}

// ==========================================
// REFRESH ALL — call after any data change
// ==========================================

function refreshAll() {
  updateStats();
  renderCategorySidebar();

  // Determine active view and re-render it
  const activeView = document.querySelector('.view.active');
  if (activeView) {
    const viewName = activeView.id.replace('view-', '');
    renderView(viewName);
  }
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================

document.addEventListener('keydown', e => {
  // Escape closes any open modal
  if (e.key === 'Escape') {
    closeTaskModal();
    closeDetailModal();
    closeCatModal();
    closeSidebar();
  }
  // Ctrl/Cmd + N opens new task
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openTaskModal();
  }
});

// ==========================================
// SAMPLE DATA (first-time load)
// ==========================================

function seedSampleData() {
  const today    = todayStr();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tmrStr   = tomorrow.toISOString().slice(0, 10);
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 5);
  const nwStr    = nextWeek.toISOString().slice(0, 10);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const ydStr    = yesterday.toISOString().slice(0, 10);

  state.tasks = [
    {
      id: genId(), title: 'Review project proposal',
      description: 'Go through the Q3 project proposal and add comments.',
      due: today, priority: 'high', category: 'work',
      completed: false, createdAt: Date.now(), updatedAt: Date.now(),
    },
    {
      id: genId(), title: 'Morning run – 5km',
      description: 'Stick to the training schedule.',
      due: today, priority: 'medium', category: 'health',
      completed: true, createdAt: Date.now(), updatedAt: Date.now(),
    },
    {
      id: genId(), title: 'Read Chapter 4 – Machine Learning',
      description: 'Finish the chapter on neural networks.',
      due: tmrStr, priority: 'medium', category: 'study',
      completed: false, createdAt: Date.now(), updatedAt: Date.now(),
    },
    {
      id: genId(), title: 'Call dentist for appointment',
      description: '',
      due: tmrStr, priority: 'low', category: 'personal',
      completed: false, createdAt: Date.now(), updatedAt: Date.now(),
    },
    {
      id: genId(), title: 'Prepare team standup notes',
      description: 'Summarise last sprint blockers and wins.',
      due: nwStr, priority: 'medium', category: 'work',
      completed: false, createdAt: Date.now(), updatedAt: Date.now(),
    },
    {
      id: genId(), title: 'Submit assignment',
      description: 'Statistics homework — upload to the portal.',
      due: ydStr, priority: 'high', category: 'study',
      completed: false, createdAt: Date.now(), updatedAt: Date.now(),
    },
  ];

  // Seed some activity
  logActivity('Added: "Review project proposal"', '#10b981');
  logActivity('Completed: "Morning run – 5km"',   '#10b981');
  logActivity('Added: "Submit assignment"',        '#ef4444');
}

/** Seed a few sample routines so new users can see how it works */
function seedSampleRoutines() {
  state.routines = [
    {
      id: genId(), title: 'Drink Water 💧',
      description: 'Stay hydrated — 8 glasses a day!',
      priority: 'medium', category: 'health',
      days: [0,1,2,3,4,5,6], active: true,
      hasInterval: true, intervalHours: 2,
      window: 'all', startTime: '08:00', endTime: '22:00',
      lastAutoAdded: null, lastNotified: 0, createdAt: Date.now(),
    },
    {
      id: genId(), title: 'Morning Workout 🏃',
      description: '30-min exercise session',
      priority: 'high', category: 'health',
      days: [1,2,3,4,5], active: true,
      hasInterval: false, intervalHours: 0,
      window: 'morning', startTime: '', endTime: '',
      lastAutoAdded: null, lastNotified: 0, createdAt: Date.now(),
    },
    {
      id: genId(), title: 'Daily Journal ✍️',
      description: 'Write 5 minutes about the day',
      priority: 'low', category: 'personal',
      days: [0,1,2,3,4,5,6], active: true,
      hasInterval: false, intervalHours: 0,
      window: 'evening', startTime: '', endTime: '',
      lastAutoAdded: null, lastNotified: 0, createdAt: Date.now(),
    },
    {
      id: genId(), title: 'Check Posture 🪑',
      description: 'Sit up straight and take a stretch break',
      priority: 'low', category: 'health',
      days: [1,2,3,4,5], active: false,
      hasInterval: true, intervalHours: 1,
      window: 'all', startTime: '09:00', endTime: '18:00',
      lastAutoAdded: null, lastNotified: 0, createdAt: Date.now(),
    },
  ];
}

// ==========================================
// ROUTINES ENGINE
// ==========================================

/**
 * Routine object shape:
 * {
 *   id, title, description, priority, category,
 *   days: [0-6],          // which days of week it fires (0=Sun)
 *   active: bool,         // alarm on/off
 *   hasInterval: bool,    // recurring nudge?
 *   intervalHours: num,   // e.g. 2
 *   window: 'all'|'morning'|'afternoon'|'evening',
 *   startTime: 'HH:MM' | '',
 *   endTime:   'HH:MM' | '',
 *   lastAutoAdded: 'YYYY-MM-DD',  // prevent duplicate adds
 *   lastNotified:  timestamp,     // for interval throttle
 *   createdAt: timestamp
 * }
 */

const DAY_NAMES   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const WINDOW_MAP  = {
  all:       { start: '00:00', end: '23:59' },
  morning:   { start: '06:00', end: '12:00' },
  afternoon: { start: '12:00', end: '18:00' },
  evening:   { start: '18:00', end: '22:00' },
};

// Interval timer handle — runs every 60s to check nudges
let routineTickerHandle = null;

/** Category icon map — pick a nice icon per category name */
function routineIcon(catId) {
  const map = { health: 'fa-heart-pulse', work: 'fa-briefcase', study: 'fa-book-open', personal: 'fa-user' };
  return map[catId] || 'fa-rotate';
}

// ---------- Render Routines View ----------

function renderRoutines() {
  const grid = document.getElementById('routinesGrid');
  grid.innerHTML = '';

  // Notification permission banner
  if ('Notification' in window && Notification.permission === 'default') {
    const banner = document.createElement('div');
    banner.className = 'notif-banner';
    banner.style.gridColumn = '1 / -1';
    banner.innerHTML = `
      <i class="fa-solid fa-bell"></i>
      <span>Enable browser notifications to receive interval reminders.</span>
      <button id="enableNotifBtn">Enable</button>
    `;
    grid.appendChild(banner);
    document.getElementById('enableNotifBtn').addEventListener('click', requestNotifPermission);
  }

  if (!state.routines.length) {
    const empty = document.createElement('div');
    empty.className = 'routines-empty';
    empty.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔔</div>
        <h3>No routines yet</h3>
        <p>Create a routine to auto-add tasks daily and get interval reminders.</p>
      </div>`;
    grid.appendChild(empty);
    updateRoutinesBadge();
    return;
  }

  state.routines.forEach(r => grid.appendChild(buildRoutineCard(r)));
  updateRoutinesBadge();
}

/** Build a single routine card DOM element */
function buildRoutineCard(routine) {
  const cat = getCategory(routine.category);
  const priorityLabel = { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' };

  const card = document.createElement('div');
  card.className = `routine-card priority-${routine.priority} ${routine.active ? '' : 'paused'}`;
  card.dataset.rid = routine.id;

  // Days strip
  const daysHtml = DAY_NAMES.map((d, i) =>
    `<span class="rday ${routine.days.includes(i) ? 'on' : ''}">${d}</span>`
  ).join('');

  // Interval info line
  let intervalHtml = '';
  if (routine.hasInterval) {
    const hrs = routine.intervalHours;
    const label = hrs < 1 ? `${hrs * 60} min` : `${hrs} hr`;
    const win = routine.window !== 'all' ? ` · ${routine.window}` : '';
    const next = getNextFireLabel(routine);
    intervalHtml = `
      <div class="routine-interval-info">
        <i class="fa-solid fa-bell"></i>
        <span>Every ${label}${win}</span>
        ${next ? `<span class="routine-countdown" style="margin-left:auto"><i class="fa-regular fa-clock"></i> ${next}</span>` : ''}
      </div>`;
  }

  card.innerHTML = `
    <div class="routine-card-header">
      <div class="routine-icon">
        <i class="fa-solid ${routineIcon(routine.category)}"></i>
      </div>
      <div class="routine-info">
        <div class="routine-name">${escHtml(routine.title)}</div>
        ${routine.description ? `<div class="routine-desc-text">${escHtml(routine.description)}</div>` : ''}
        <div class="routine-meta">
          <span class="badge badge-${routine.priority}">${priorityLabel[routine.priority]}</span>
          ${cat ? `<span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}">${cat.name}</span>` : ''}
          ${routine.hasInterval ? '<span class="badge" style="background:var(--accent-light);color:var(--accent)"><i class="fa-solid fa-bell"></i> Interval</span>' : ''}
        </div>
      </div>
    </div>

    <div class="routine-days">${daysHtml}</div>

    ${intervalHtml}

    <div class="routine-card-footer">
      <span class="routine-status-label">${routine.active ? '✅ Active' : '⏸ Paused'}</span>
      <div class="routine-actions">
        <button class="task-btn routine-edit-btn" title="Edit" data-rid="${routine.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="task-btn del routine-del-btn" title="Delete" data-rid="${routine.id}"><i class="fa-solid fa-trash"></i></button>
        <label class="alarm-toggle" title="${routine.active ? 'Pause routine' : 'Activate routine'}">
          <input type="checkbox" class="routine-toggle-chk" data-rid="${routine.id}" ${routine.active ? 'checked' : ''} />
          <span class="alarm-slider"></span>
        </label>
      </div>
    </div>
  `;

  // Toggle active
  card.querySelector('.routine-toggle-chk').addEventListener('change', e => {
    toggleRoutineActive(routine.id, e.target.checked);
  });

  // Edit
  card.querySelector('.routine-edit-btn').addEventListener('click', () => openRoutineModal(routine.id));

  // Delete
  card.querySelector('.routine-del-btn').addEventListener('click', () => deleteRoutine(routine.id));

  return card;
}

/** "Next reminder in X min" label for interval routines */
function getNextFireLabel(routine) {
  if (!routine.active || !routine.hasInterval) return '';
  const now       = Date.now();
  const last      = routine.lastNotified || (now - routine.intervalHours * 3600000); // pretend fired intervalHours ago
  const nextFire  = last + routine.intervalHours * 3600000;
  const diffMs    = nextFire - now;
  if (diffMs <= 0) return 'soon';
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  return `${Math.round(diffMin / 60)}h`;
}

/** Update sidebar badge showing count of active routines */
function updateRoutinesBadge() {
  const badge  = document.getElementById('routinesBadge');
  const active = state.routines.filter(r => r.active).length;
  if (active > 0) {
    badge.textContent = active;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ---------- Toggle / Delete ----------

function toggleRoutineActive(id, active) {
  const r = state.routines.find(r => r.id === id);
  if (!r) return;
  r.active = active;
  if (active) {
    r.lastNotified = Date.now(); // reset so first nudge fires after 1 interval
    logActivity(`Activated routine: "${r.title}"`, '#6366f1');
    showToast(`Routine "${r.title}" activated 🔔`, 'success');
  } else {
    logActivity(`Paused routine: "${r.title}"`, '#9ca3af');
    showToast(`Routine "${r.title}" paused.`, 'info');
  }
  saveState();
  renderRoutines();
}

function deleteRoutine(id) {
  const r = state.routines.find(r => r.id === id);
  if (!r) return;
  state.routines = state.routines.filter(r => r.id !== id);
  logActivity(`Deleted routine: "${r.title}"`, '#ef4444');
  showToast(`Routine "${r.title}" deleted.`, 'error');
  saveState();
  renderRoutines();
}

// ---------- Auto-add tasks from routines ----------

/**
 * Called on app load and every midnight.
 * For every ACTIVE routine whose day matches today and hasn't been added yet today,
 * inject a task for today.
 */
function autoAddRoutineTasks() {
  const today   = todayStr();
  const dayOfWeek = new Date().getDay(); // 0=Sun
  let added = 0;

  state.routines.forEach(r => {
    if (!r.active) return;
    if (!r.days.includes(dayOfWeek)) return;
    if (r.lastAutoAdded === today) return; // already done today

    // Create a task for today
    const task = {
      id:          genId(),
      title:       r.title,
      description: r.description || '',
      due:         today,
      priority:    r.priority,
      category:    r.category,
      completed:   false,
      fromRoutine: r.id,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };
    state.tasks.unshift(task);
    r.lastAutoAdded = today;
    added++;
  });

  if (added > 0) {
    saveState();
    refreshAll();
    showToast(`${added} routine task${added > 1 ? 's' : ''} added for today 📅`, 'info', 4000);
    logActivity(`Auto-added ${added} routine task(s) for today`, '#6366f1');
  }
}

// ---------- Interval reminder ticker ----------

/** Schedule the next-midnight auto-add */
function scheduleMidnightRefresh() {
  const now       = new Date();
  const midnight  = new Date(now);
  midnight.setHours(24, 0, 30, 0); // 00:00:30 next day
  const msUntil = midnight - now;
  setTimeout(() => {
    autoAddRoutineTasks();
    scheduleMidnightRefresh(); // reschedule for next midnight
  }, msUntil);
}

/** Main ticker — runs every 60 seconds, checks interval reminders */
function startRoutineTicker() {
  if (routineTickerHandle) clearInterval(routineTickerHandle);
  routineTickerHandle = setInterval(checkIntervalReminders, 60 * 1000);
  // Also fire once after 5s in case something is already due
  setTimeout(checkIntervalReminders, 5000);
}

/** Check each active interval routine and fire a notification if it's time */
function checkIntervalReminders() {
  const now = Date.now();
  const currentHHMM = new Date().toTimeString().slice(0, 5); // 'HH:MM'

  state.routines.forEach(r => {
    if (!r.active || !r.hasInterval) return;

    // Check window
    const win = WINDOW_MAP[r.window || 'all'];
    if (r.startTime || r.endTime) {
      const start = r.startTime || '00:00';
      const end   = r.endTime   || '23:59';
      if (currentHHMM < start || currentHHMM > end) return;
    } else {
      if (currentHHMM < win.start || currentHHMM > win.end) return;
    }

    // Check interval elapsed
    const intervalMs = r.intervalHours * 3600 * 1000;
    const last       = r.lastNotified  || 0;
    if (now - last < intervalMs) return;

    // Fire!
    r.lastNotified = now;
    saveState();

    const message = `⏰ ${r.title} — time for your reminder!`;
    showToast(message, 'info', 6000);

    // Browser notification
    if (Notification.permission === 'granted') {
      try {
        new Notification('Taskflow Reminder', {
          body: r.title + (r.description ? '\n' + r.description : ''),
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="%236366f1"/><text x="16" y="21" text-anchor="middle" font-size="16" fill="white">⚡</text></svg>',
          tag:  'routine-' + r.id,
        });
      } catch (e) { /* notifications might be blocked */ }
    }

    // Re-render the routine card to update countdown
    if (document.getElementById('view-routines').classList.contains('active')) renderRoutines();
  });
}

/** Request browser notification permission */
function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('Your browser does not support notifications.', 'error');
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      showToast('Notifications enabled! 🔔', 'success');
      if (document.getElementById('view-routines').classList.contains('active')) renderRoutines();
    } else {
      showToast('Notifications blocked. Enable them in browser settings.', 'warning', 5000);
    }
  });
}

// ---------- Also show today's routine-task notifications at load ----------

function notifyTodaysRoutines() {
  const today     = todayStr();
  const dayOfWeek = new Date().getDay();
  const active    = state.routines.filter(r => r.active && r.days.includes(dayOfWeek));

  if (!active.length) return;

  const names = active.map(r => r.title).join(', ');
  const msg   = active.length === 1
    ? `Today's routine: "${active[0].title}" has been added ✅`
    : `${active.length} routines active today: ${names}`;

  setTimeout(() => showToast(msg, 'info', 6000), 2000);
}

// ---------- Routine Modal ----------

let editingRoutineId = null;

function openRoutineModal(routineId = null) {
  editingRoutineId = routineId;
  const titleEl = document.getElementById('routineModalTitle');

  // Reset form
  document.getElementById('routineTitle').value    = '';
  document.getElementById('routineDesc').value     = '';
  document.getElementById('routinePriority').value = 'medium';
  document.getElementById('routineHasInterval').checked = false;
  document.getElementById('intervalOptions').style.display = 'none';
  document.getElementById('routineInterval').value = '2';
  document.getElementById('routineWindow').value   = 'all';
  document.getElementById('routineStartTime').value = '';
  document.getElementById('routineEndTime').value   = '';

  populateCategorySelects();
  if (state.categories.length) {
    document.getElementById('routineCategory').value = state.categories[0].id;
  }

  // All days active by default
  document.querySelectorAll('.day-btn').forEach(b => b.classList.add('active'));

  if (routineId) {
    const r = state.routines.find(r => r.id === routineId);
    if (!r) return;
    titleEl.textContent = 'Edit Routine';
    document.getElementById('routineTitle').value    = r.title;
    document.getElementById('routineDesc').value     = r.description || '';
    document.getElementById('routinePriority').value = r.priority;
    document.getElementById('routineCategory').value = r.category;
    document.getElementById('routineHasInterval').checked = r.hasInterval;
    document.getElementById('intervalOptions').style.display = r.hasInterval ? 'block' : 'none';
    document.getElementById('routineInterval').value = String(r.intervalHours || 2);
    document.getElementById('routineWindow').value   = r.window || 'all';
    document.getElementById('routineStartTime').value = r.startTime || '';
    document.getElementById('routineEndTime').value   = r.endTime   || '';

    document.querySelectorAll('.day-btn').forEach(b => {
      const day = parseInt(b.dataset.day);
      b.classList.toggle('active', r.days.includes(day));
    });
  } else {
    titleEl.textContent = 'New Routine';
  }

  document.getElementById('routineModal').classList.add('open');
  document.getElementById('routineTitle').focus();
}

function closeRoutineModal() {
  document.getElementById('routineModal').classList.remove('open');
  editingRoutineId = null;
}

// Interval toggle show/hide
document.getElementById('routineHasInterval').addEventListener('change', e => {
  document.getElementById('intervalOptions').style.display = e.target.checked ? 'block' : 'none';
});

// Day picker toggles
document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('active'));
});

// Modal open/close
document.getElementById('routinesAddBtn').addEventListener('click', () => openRoutineModal());
document.getElementById('routineModalClose').addEventListener('click', closeRoutineModal);
document.getElementById('routineCancel').addEventListener('click', closeRoutineModal);
document.getElementById('routineModal').addEventListener('click', e => {
  if (e.target === document.getElementById('routineModal')) closeRoutineModal();
});

// Save routine
document.getElementById('routineSave').addEventListener('click', saveRoutine);

function saveRoutine() {
  const title       = document.getElementById('routineTitle').value.trim();
  const desc        = document.getElementById('routineDesc').value.trim();
  const priority    = document.getElementById('routinePriority').value;
  const category    = document.getElementById('routineCategory').value;
  const hasInterval = document.getElementById('routineHasInterval').checked;
  const intervalHrs = parseFloat(document.getElementById('routineInterval').value) || 2;
  const window_     = document.getElementById('routineWindow').value;
  const startTime   = document.getElementById('routineStartTime').value;
  const endTime     = document.getElementById('routineEndTime').value;

  const days = [...document.querySelectorAll('.day-btn.active')].map(b => parseInt(b.dataset.day));

  if (!title) {
    showToast('Please enter a routine title.', 'warning');
    document.getElementById('routineTitle').focus();
    return;
  }
  if (!days.length) {
    showToast('Select at least one active day.', 'warning');
    return;
  }

  if (editingRoutineId) {
    const r = state.routines.find(r => r.id === editingRoutineId);
    if (r) {
      Object.assign(r, { title, description: desc, priority, category, days, hasInterval,
        intervalHours: intervalHrs, window: window_, startTime, endTime });
      if (hasInterval) r.lastNotified = 0; // reset so it fires soon
      logActivity(`Updated routine: "${title}"`, '#6366f1');
      showToast('Routine updated!', 'info');
    }
  } else {
    const newRoutine = {
      id: genId(), title, description: desc, priority, category, days,
      active: true, hasInterval, intervalHours: intervalHrs,
      window: window_, startTime, endTime,
      lastAutoAdded: null, lastNotified: 0,
      createdAt: Date.now(),
    };
    state.routines.push(newRoutine);
    logActivity(`Created routine: "${title}"`, '#6366f1');
    showToast(`Routine "${title}" created! 🔔`, 'success');

    // If today is one of its active days, auto-add immediately
    const todayDay = new Date().getDay();
    if (days.includes(todayDay)) {
      const today = todayStr();
      if (newRoutine.lastAutoAdded !== today) {
        state.tasks.unshift({
          id: genId(), title, description: desc, due: today,
          priority, category, completed: false,
          fromRoutine: newRoutine.id, createdAt: Date.now(), updatedAt: Date.now(),
        });
        newRoutine.lastAutoAdded = today;
        showToast(`"${title}" added to today's tasks!`, 'info', 3500);
      }
    }
  }

  // Request notification permission if interval reminder is enabled
  if (hasInterval && Notification.permission === 'default') {
    setTimeout(() => {
      if (confirm('Allow browser notifications for interval reminders?')) {
        requestNotifPermission();
      }
    }, 400);
  }

  saveState();
  closeRoutineModal();
  refreshAll();
  renderRoutines();
}

// ==========================================
// INIT
// ==========================================

function init() {
  loadState();

  // First visit — seed sample data
  if (!state.tasks.length) {
    seedSampleData();
    saveState();
  }

  // Ensure routines array exists (backward compat with older saved states)
  if (!state.routines) state.routines = [];

  // Apply persisted theme
  applyTheme(state.theme || 'light');

  // Greeting
  setGreeting();

  // Wire up stat card clicks
  initStatCardClicks();

  // Build category sidebar + selects
  renderCategorySidebar();

  // Start on dashboard
  switchView('dashboard');

  // Auto-add today's routine tasks (runs at startup + every midnight)
  autoAddRoutineTasks();
  scheduleMidnightRefresh();

  // Start interval reminder ticker
  startRoutineTicker();

  // Check for tomorrow's task reminders
  setTimeout(checkUpcomingReminders, 1500);

  // Notify about today's active routines
  notifyTodaysRoutines();

  // Seed a sample routine on very first visit
  if (!state.routines.length) {
    seedSampleRoutines();
    saveState();
  }

  // Update badge
  updateRoutinesBadge();

  // Announce ready
  console.log('%cTaskflow ready ⚡', 'font-size:16px;font-weight:bold;color:#6366f1;');
}

// Kick everything off
init();
