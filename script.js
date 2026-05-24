/* ============================================================
   TASKFLOW — script.js  (Firebase Multi-User Edition)
   All data lives in Firestore under users/{uid}/
   localStorage is used only for theme preference.
   ============================================================ */

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: 'personal', name: 'Personal', color: '#6366f1' },
  { id: 'study',    name: 'Study',    color: '#f59e0b' },
  { id: 'work',     name: 'Work',     color: '#3b82f6' },
  { id: 'health',   name: 'Health',   color: '#10b981' },
];

const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#84cc16',
  '#10b981','#06b6d4','#3b82f6','#6366f1',
  '#8b5cf6','#ec4899','#64748b','#0ea5e9',
];

const DAY_NAMES  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const WINDOW_MAP = {
  all:       { start: '00:00', end: '23:59' },
  morning:   { start: '06:00', end: '12:00' },
  afternoon: { start: '12:00', end: '18:00' },
  evening:   { start: '18:00', end: '22:00' },
};

const TOAST_ICONS = {
  success: 'fa-circle-check',
  error:   'fa-circle-xmark',
  info:    'fa-circle-info',
  warning: 'fa-triangle-exclamation',
};

// ─────────────────────────────────────────────
// IN-MEMORY STATE  (populated from Firestore)
// ─────────────────────────────────────────────
let currentUser   = null;   // Firebase User object
let state = {
  tasks:      [],
  categories: [...DEFAULT_CATEGORIES],
  routines:   [],
  activity:   [],
  theme:      'light',
  _filterOverdue: false,
};

// Firestore real-time unsubscribe handles
let unsubTasks      = null;
let unsubRoutines   = null;
let unsubMeta       = null;

// Interval timer for routine nudges
let routineTickerHandle = null;
let calendarInstance    = null;

// ─────────────────────────────────────────────
// FIRESTORE HELPERS
// ─────────────────────────────────────────────
function userCol(col) {
  return db.collection('users').doc(currentUser.uid).collection(col);
}
function userDoc() {
  return db.collection('users').doc(currentUser.uid);
}

// ─────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────
function formatDate(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function isToday(d)   { return d === todayStr(); }
function isOverdue(d) { return !!d && d < todayStr(); }
function getCategory(id) { return state.categories.find(c => c.id === id) || null; }
function genId() { return Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24)  return `${hr}h ago`;
  return `${day}d ago`;
}
function routineIcon(catId) {
  const map = { health:'fa-heart-pulse', work:'fa-briefcase', study:'fa-book-open', personal:'fa-user' };
  return map[catId] || 'fa-rotate';
}

// ─────────────────────────────────────────────
// ACTIVITY LOG  (saved to Firestore meta doc)
// ─────────────────────────────────────────────
function logActivity(text, color) {
  state.activity.unshift({ text, color, ts: Date.now() });
  if (state.activity.length > 20) state.activity.pop();
  // Persist to Firestore (non-blocking, best-effort)
  userDoc().set({ activity: state.activity }, { merge: true }).catch(() => {});
}

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  localStorage.setItem('taskflow_theme', theme);
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (theme === 'dark') {
    icon.className   = 'fa-solid fa-sun';
    label.textContent = 'Light Mode';
  } else {
    icon.className   = 'fa-solid fa-moon';
    label.textContent = 'Dark Mode';
  }
}
document.getElementById('themeToggle').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────

// Tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
});

// Password eye toggles
document.querySelectorAll('.pw-eye').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = document.getElementById(btn.dataset.target);
    const isText = inp.type === 'text';
    inp.type = isText ? 'password' : 'text';
    btn.querySelector('i').className = isText ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  });
});

function showAuthError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

// Google Sign-In (both buttons)
async function signInWithGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
    // onAuthStateChanged will handle the rest
  } catch (e) {
    showAuthError('loginError', friendlyAuthError(e.code));
    showAuthError('signupError', friendlyAuthError(e.code));
  }
}
document.getElementById('googleSignInBtn').addEventListener('click', signInWithGoogle);
document.getElementById('googleSignUpBtn').addEventListener('click', signInWithGoogle);

// Email Sign-In
document.getElementById('emailSignInBtn').addEventListener('click', async () => {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const remember = document.getElementById('rememberMe').checked;
  showAuthError('loginError', '');
  if (!email || !password) { showAuthError('loginError', 'Please fill in all fields.'); return; }
  try {
    const persistence = remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
    await auth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    showAuthError('loginError', friendlyAuthError(e.code));
  }
});

// Email Sign-Up
document.getElementById('emailSignUpBtn').addEventListener('click', async () => {
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  showAuthError('signupError', '');
  if (!name || !email || !password) { showAuthError('signupError', 'Please fill in all fields.'); return; }
  if (password.length < 6)          { showAuthError('signupError', 'Password must be at least 6 characters.'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
  } catch (e) {
    showAuthError('signupError', friendlyAuthError(e.code));
  }
});

// Forgot password
document.getElementById('forgotLink').addEventListener('click', async e => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { showAuthError('loginError', 'Enter your email above first.'); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showAuthError('loginError', '');
    showToast('Password reset email sent!', 'success');
  } catch (e) {
    showAuthError('loginError', friendlyAuthError(e.code));
  }
});

// Sign-out
document.getElementById('signOutBtn').addEventListener('click', async () => {
  teardownFirestoreListeners();
  await auth.signOut();
});

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/too-many-requests':    'Too many attempts. Try again later.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ─────────────────────────────────────────────
// AUTH STATE OBSERVER  (central entry point)
// ─────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display  = 'flex';
    await bootstrapUserApp(user);
  } else {
    currentUser = null;
    teardownFirestoreListeners();
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display  = 'none';
    // Reset state
    state.tasks = []; state.routines = []; state.activity = [];
    state.categories = [...DEFAULT_CATEGORIES];
    calendarInstance = null;
  }
});

// ─────────────────────────────────────────────
// BOOTSTRAP — runs once after login
// ─────────────────────────────────────────────
async function bootstrapUserApp(user) {
  // Populate sidebar user info
  const displayName = user.displayName || user.email.split('@')[0];
  document.getElementById('userName').textContent  = displayName;
  document.getElementById('userEmail').textContent = user.email || '';
  const av = document.getElementById('userAvatar');
  if (user.photoURL) {
    av.innerHTML = `<img src="${user.photoURL}" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
  } else {
    av.textContent = displayName.charAt(0).toUpperCase();
  }

  // Theme
  applyTheme(localStorage.getItem('taskflow_theme') || 'light');

  // Ensure Firestore user doc + default categories exist
  await ensureUserDoc(user);

  // Start real-time listeners
  setupFirestoreListeners();

  // Greeting & greeting date
  setGreeting();

  // Wire up UI
  initStatCardClicks();

  // Start on dashboard
  switchView('dashboard');

  // Routine ticker
  startRoutineTicker();
  setTimeout(checkUpcomingReminders, 2000);
}

// Create the user document if first login
async function ensureUserDoc(user) {
  const ref = userDoc();
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      displayName: user.displayName || '',
      email:       user.email || '',
      categories:  DEFAULT_CATEGORIES,
      activity:    [],
      createdAt:   Date.now(),
    });
    // Seed sample tasks & routines for new users
    await seedNewUserData();
  } else {
    // Load categories & activity from meta doc
    const data = snap.data();
    state.categories = data.categories || [...DEFAULT_CATEGORIES];
    state.activity   = data.activity   || [];
  }
}

// Seed first-time sample data into Firestore
async function seedNewUserData() {
  const today  = todayStr();
  const tmr    = new Date(); tmr.setDate(tmr.getDate() + 1);
  const tmrStr = tmr.toISOString().slice(0, 10);
  const nw     = new Date(); nw.setDate(nw.getDate() + 5);
  const nwStr  = nw.toISOString().slice(0, 10);
  const yd     = new Date(); yd.setDate(yd.getDate() - 1);
  const ydStr  = yd.toISOString().slice(0, 10);

  const tasksCol = userCol('tasks');
  const sampleTasks = [
    { title: 'Review project proposal', description: 'Go through the Q3 proposal.', due: today,  priority: 'high',   category: 'work',     completed: false },
    { title: 'Morning run – 5km',       description: 'Stick to the training plan.', due: today,  priority: 'medium', category: 'health',   completed: true  },
    { title: 'Read Chapter 4 – ML',     description: 'Finish the neural nets chapter.', due: tmrStr, priority: 'medium', category: 'study', completed: false },
    { title: 'Call dentist',            description: '', due: tmrStr, priority: 'low',    category: 'personal', completed: false },
    { title: 'Team standup notes',      description: 'Summarise last sprint.',      due: nwStr,  priority: 'medium', category: 'work',     completed: false },
    { title: 'Submit assignment',       description: 'Upload to the portal.',       due: ydStr,  priority: 'high',   category: 'study',    completed: false },
  ];
  const batch = db.batch();
  sampleTasks.forEach(t => {
    const ref = tasksCol.doc();
    batch.set(ref, { ...t, createdAt: Date.now(), updatedAt: Date.now() });
  });

  const routinesCol = userCol('routines');
  const sampleRoutines = [
    { title: 'Drink Water 💧', description: 'Stay hydrated — 8 glasses a day!', priority: 'medium', category: 'health',   days: [0,1,2,3,4,5,6], active: true,  hasInterval: true,  intervalHours: 2, window_: 'all', startTime: '08:00', endTime: '22:00', lastAutoAdded: null, lastNotified: 0 },
    { title: 'Morning Workout 🏃', description: '30-min exercise session',        priority: 'high',   category: 'health',   days: [1,2,3,4,5],     active: true,  hasInterval: false, intervalHours: 0, window_: 'morning', startTime: '', endTime: '', lastAutoAdded: null, lastNotified: 0 },
    { title: 'Daily Journal ✍️',  description: 'Write 5 minutes about the day',  priority: 'low',    category: 'personal', days: [0,1,2,3,4,5,6], active: true,  hasInterval: false, intervalHours: 0, window_: 'evening', startTime: '', endTime: '', lastAutoAdded: null, lastNotified: 0 },
    { title: 'Check Posture 🪑',  description: 'Sit up straight, take a break',  priority: 'low',    category: 'health',   days: [1,2,3,4,5],     active: false, hasInterval: true,  intervalHours: 1, window_: 'all', startTime: '09:00', endTime: '18:00', lastAutoAdded: null, lastNotified: 0 },
  ];
  sampleRoutines.forEach(r => {
    const ref = routinesCol.doc();
    batch.set(ref, { ...r, createdAt: Date.now() });
  });
  await batch.commit();
}

// ─────────────────────────────────────────────
// FIRESTORE REAL-TIME LISTENERS
// ─────────────────────────────────────────────
function setupFirestoreListeners() {
  // Tasks
  unsubTasks = userCol('tasks')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      refreshAll();
      autoAddRoutineTasks();
    }, err => console.error('Tasks listener error:', err));

  // Routines
  unsubRoutines = userCol('routines')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      state.routines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateRoutinesBadge();
      if (document.getElementById('view-routines').classList.contains('active')) renderRoutines();
    }, err => console.error('Routines listener error:', err));

  // Meta (categories, activity)
  unsubMeta = userDoc().onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();
    state.categories = data.categories || [...DEFAULT_CATEGORIES];
    state.activity   = data.activity   || [];
    renderCategorySidebar();
    if (document.getElementById('activityList')) renderActivity();
  }, err => console.error('Meta listener error:', err));
}

function teardownFirestoreListeners() {
  if (unsubTasks)    { unsubTasks();    unsubTasks    = null; }
  if (unsubRoutines) { unsubRoutines(); unsubRoutines = null; }
  if (unsubMeta)     { unsubMeta();     unsubMeta     = null; }
  if (routineTickerHandle) { clearInterval(routineTickerHandle); routineTickerHandle = null; }
}

// ─────────────────────────────────────────────
// GREETING
// ─────────────────────────────────────────────
function setGreeting() {
  const hour = new Date().getHours();
  const user = currentUser?.displayName?.split(' ')[0] || '';
  let greet = `Good morning${user ? ', ' + user : ''}! 👋`;
  if (hour >= 12 && hour < 17) greet = `Good afternoon${user ? ', ' + user : ''}! ☀️`;
  else if (hour >= 17)         greet = `Good evening${user ? ', ' + user : ''}! 🌙`;
  document.getElementById('greetingText').textContent = greet;
  document.getElementById('greetingDate').textContent =
    new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ─────────────────────────────────────────────
// SIDEBAR / NAV
// ─────────────────────────────────────────────
const sidebar      = document.getElementById('sidebar');
const hamburger    = document.getElementById('hamburger');
const sidebarClose = document.getElementById('sidebarClose');

const overlay = document.createElement('div');
overlay.className = 'sidebar-overlay';
document.body.appendChild(overlay);

function openSidebar()  { sidebar.classList.add('open');  overlay.classList.add('active'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('active'); }

hamburger.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewName);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewName);
  });
  const titles = { dashboard:'Dashboard', tasks:'All Tasks', today:'Today',
                   upcoming:'Upcoming',  calendar:'Calendar', routines:'Routines' };
  document.getElementById('topbarTitle').textContent = titles[viewName] || 'Taskflow';
  renderView(viewName);
  closeSidebar();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); switchView(item.dataset.view); });
});
document.querySelectorAll('.see-all').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); switchView(link.dataset.view); });
});

function renderView(view) {
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'tasks':     renderAllTasks();  break;
    case 'today':     renderToday();     break;
    case 'upcoming':  renderUpcoming();  break;
    case 'calendar':  renderCalendar();  break;
    case 'routines':  renderRoutines();  break;
  }
}

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────
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

function initStatCardClicks() {
  const map = {
    statTotal:     { status: 'all'       },
    statCompleted: { status: 'completed' },
    statPending:   { status: 'pending'   },
    statOverdue:   { status: 'overdue'   },
  };
  Object.entries(map).forEach(([id, meta]) => {
    const card = document.getElementById(id)?.closest('.stat-card');
    if (!card) return;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      document.getElementById('filterStatus').value   = 'all';
      document.getElementById('filterPriority').value = 'all';
      document.getElementById('filterCategory').value = 'all';
      document.getElementById('globalSearch').value   = '';
      state._filterOverdue = meta.status === 'overdue';
      if (meta.status !== 'overdue') document.getElementById('filterStatus').value = meta.status;
      else document.getElementById('filterStatus').value = 'pending';
      switchView('tasks');
    });
  });
}

// ─────────────────────────────────────────────
// CATEGORIES SIDEBAR
// ─────────────────────────────────────────────
function renderCategorySidebar() {
  const list = document.getElementById('categoryList');
  if (!list) return;
  list.innerHTML = '';
  state.categories.forEach(cat => {
    const count = state.tasks.filter(t => t.category === cat.id).length;
    const item  = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `<span class="cat-dot" style="background:${cat.color}"></span><span>${cat.name}</span><span class="cat-count">${count}</span>`;
    item.addEventListener('click', () => {
      document.getElementById('filterCategory').value = cat.id;
      switchView('tasks');
    });
    list.appendChild(item);
  });
  populateCategorySelects();
}

function populateCategorySelects() {
  // Filter bar
  const filterSel = document.getElementById('filterCategory');
  const cur = filterSel.value;
  filterSel.innerHTML = '<option value="all">All</option>';
  state.categories.forEach(cat => {
    const o = document.createElement('option'); o.value = cat.id; o.textContent = cat.name;
    filterSel.appendChild(o);
  });
  filterSel.value = cur || 'all';

  // Task modal
  const taskSel = document.getElementById('taskCategory');
  taskSel.innerHTML = '';
  state.categories.forEach(cat => {
    const o = document.createElement('option'); o.value = cat.id; o.textContent = cat.name;
    taskSel.appendChild(o);
  });

  // Routine modal
  const routSel = document.getElementById('routineCategory');
  if (routSel) {
    routSel.innerHTML = '';
    state.categories.forEach(cat => {
      const o = document.createElement('option'); o.value = cat.id; o.textContent = cat.name;
      routSel.appendChild(o);
    });
  }
}

// ─────────────────────────────────────────────
// TASK CARD BUILDER
// ─────────────────────────────────────────────
function buildTaskCard(task, compact = false) {
  const cat     = getCategory(task.category);
  const overdue = !task.completed && isOverdue(task.due);
  const card    = document.createElement('div');
  card.className = `task-card priority-${task.priority} ${task.completed ? 'completed' : ''}`;
  card.dataset.id = task.id;

  const priorityLabel = { high:'🔴 High', medium:'🟡 Medium', low:'🟢 Low' };
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
      <div class="task-title-row"><span class="task-name">${escHtml(task.title)}</span></div>
      ${!compact && task.description ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="badge badge-${task.priority}">${priorityLabel[task.priority]}</span>
        ${cat ? `<span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}"><i class="fa-solid fa-tag"></i> ${cat.name}</span>` : ''}
        ${dueBadge}
      </div>
    </div>
    <div class="task-actions">
      <button class="task-btn view-btn" title="View" data-id="${task.id}"><i class="fa-solid fa-eye"></i></button>
      <button class="task-btn edit-btn" title="Edit" data-id="${task.id}"><i class="fa-solid fa-pen"></i></button>
      <button class="task-btn del"      title="Delete" data-id="${task.id}"><i class="fa-solid fa-trash"></i></button>
    </div>`;

  card.querySelector('.task-check').addEventListener('click', e => { e.stopPropagation(); toggleComplete(task.id); });
  card.querySelector('.view-btn').addEventListener('click',   e => { e.stopPropagation(); openDetailModal(task.id); });
  card.querySelector('.edit-btn').addEventListener('click',   e => { e.stopPropagation(); openTaskModal(task.id); });
  card.querySelector('.del').addEventListener('click',        e => { e.stopPropagation(); deleteTask(task.id); });
  return card;
}

function renderTaskList(container, tasks, compact = false) {
  container.innerHTML = '';
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No tasks here</h3><p>Add a new task to get started!</p></div>`;
    return;
  }
  tasks.forEach(t => container.appendChild(buildTaskCard(t, compact)));
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
function renderDashboard() {
  updateStats();
  renderCategorySidebar();
  renderTaskList(document.getElementById('dashTodayList'), state.tasks.filter(t => isToday(t.due)), true);
  renderActivity();
}

function renderActivity() {
  const list = document.getElementById('activityList');
  if (!list) return;
  list.innerHTML = '';
  if (!state.activity.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🕐</div><h3>No activity yet</h3><p>Actions will appear here.</p></div>`;
    return;
  }
  state.activity.slice(0, 10).forEach(a => {
    const el = document.createElement('div');
    el.className = 'activity-item';
    el.innerHTML = `<span class="activity-dot" style="background:${a.color||'#6366f1'}"></span><span class="activity-text">${escHtml(a.text)}</span><span class="activity-time">${relativeTime(a.ts)}</span>`;
    list.appendChild(el);
  });
}

// ─────────────────────────────────────────────
// ALL TASKS
// ─────────────────────────────────────────────
function renderAllTasks() {
  updateFilterBanner();
  const tasks     = getFilteredTasks();
  const container = document.getElementById('allTasksList');
  renderTaskList(container, tasks);

  if (container._sortable) container._sortable.destroy();
  container._sortable = new Sortable(container, {
    animation: 150, handle: '.drag-handle',
    ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
    onEnd() {
      // Reorder is visual only with Firestore (no persistent order field added for simplicity)
    },
  });
}

function updateFilterBanner() {
  const old = document.getElementById('filterBanner');
  if (old) old.remove();
  const statusVal   = document.getElementById('filterStatus').value;
  const overdueOnly = state._filterOverdue === true;
  let label = null, icon = '', color = '';
  if (overdueOnly)              { label='Overdue Tasks';   icon='fa-triangle-exclamation'; color='var(--high)'; }
  else if (statusVal==='completed') { label='Completed Tasks'; icon='fa-circle-check';        color='var(--low)'; }
  else if (statusVal==='pending')   { label='Pending Tasks';   icon='fa-hourglass-half';      color='var(--medium)'; }
  if (!label) return;
  const banner = document.createElement('div');
  banner.id = 'filterBanner';
  banner.style.cssText = `display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 16px;background:color-mix(in srgb,${color} 12%,transparent);border:1px solid color-mix(in srgb,${color} 30%,transparent);border-radius:var(--radius-sm);font-size:.88rem;font-weight:600;color:${color};animation:cardIn .2s ease`;
  banner.innerHTML = `<i class="fa-solid ${icon}"></i><span>Showing: ${label}</span><button onclick="clearStatFilter()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:${color};font-size:.8rem;display:flex;align-items:center;gap:5px;font-family:var(--font-body);font-weight:600;opacity:.8"><i class="fa-solid fa-xmark"></i> Clear</button>`;
  document.getElementById('allTasksList').parentNode.insertBefore(banner, document.getElementById('allTasksList'));
}

function clearStatFilter() {
  document.getElementById('filterStatus').value   = 'all';
  document.getElementById('filterPriority').value = 'all';
  document.getElementById('filterCategory').value = 'all';
  state._filterOverdue = false;
  renderAllTasks();
}

function getFilteredTasks() {
  const statusVal   = document.getElementById('filterStatus').value;
  const priorityVal = document.getElementById('filterPriority').value;
  const catVal      = document.getElementById('filterCategory').value;
  const search      = document.getElementById('globalSearch').value.trim().toLowerCase();
  const overdueOnly = state._filterOverdue === true;
  return state.tasks.filter(t => {
    if (overdueOnly) { if (t.completed || !isOverdue(t.due)) return false; }
    else {
      if (statusVal==='completed' && !t.completed) return false;
      if (statusVal==='pending'   &&  t.completed) return false;
    }
    if (priorityVal!=='all' && t.priority!==priorityVal) return false;
    if (catVal!=='all'      && t.category!==catVal)      return false;
    if (search && !t.title.toLowerCase().includes(search) && !(t.description||'').toLowerCase().includes(search)) return false;
    return true;
  });
}

['filterStatus','filterPriority','filterCategory'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    state._filterOverdue = false;
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
document.getElementById('globalSearch').addEventListener('input', () => {
  if (document.getElementById('view-tasks').classList.contains('active')) renderAllTasks();
});

// ─────────────────────────────────────────────
// TODAY / UPCOMING
// ─────────────────────────────────────────────
function renderToday() {
  renderTaskList(document.getElementById('todayTasksList'), state.tasks.filter(t => isToday(t.due)));
}

function renderUpcoming() {
  const container = document.getElementById('upcomingTasksList');
  container.innerHTML = '';
  const pending = state.tasks.filter(t => !t.completed && t.due && t.due >= todayStr());
  pending.sort((a, b) => a.due.localeCompare(b.due));
  if (!pending.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎉</div><h3>All clear!</h3><p>No upcoming tasks.</p></div>`;
    return;
  }
  const groups = {};
  pending.forEach(t => { if (!groups[t.due]) groups[t.due] = []; groups[t.due].push(t); });
  Object.keys(groups).sort().forEach(dateKey => {
    const group = document.createElement('div');
    group.className = 'upcoming-group';
    let label = formatDate(dateKey);
    if (isToday(dateKey)) label = '📅 Today — ' + label;
    else if (dateKey === new Date(Date.now()+86400000).toISOString().slice(0,10)) label = '⏰ Tomorrow — ' + label;
    group.innerHTML = `<div class="upcoming-group-label">${label}</div>`;
    const tl = document.createElement('div'); tl.className = 'task-list';
    groups[dateKey].forEach(t => tl.appendChild(buildTaskCard(t)));
    group.appendChild(tl); container.appendChild(group);
  });
}

// ─────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────
function renderCalendar() {
  const el = document.getElementById('calendarEl');
  const events = state.tasks.filter(t => t.due).map(t => ({
    id: t.id, title: t.title, start: t.due,
    classNames: [`priority-${t.priority}`, t.completed ? 'fc-event-completed' : ''],
    extendedProps: { taskId: t.id },
  }));
  if (calendarInstance) {
    calendarInstance.removeAllEvents();
    calendarInstance.addEventSource(events);
    return;
  }
  calendarInstance = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    headerToolbar: { left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,listWeek' },
    height: 'auto', events,
    eventClick(info)  { openDetailModal(info.event.extendedProps.taskId); },
    dateClick(info)   { openTaskModal(null, info.dateStr); },
    eventDidMount(info) { info.el.title = info.event.title; },
  });
  calendarInstance.render();
}

// ─────────────────────────────────────────────
// TASK MODAL
// ─────────────────────────────────────────────
let editingTaskId = null;

function openTaskModal(taskId = null, prefilledDate = null) {
  editingTaskId = taskId;
  document.getElementById('taskTitle').value    = '';
  document.getElementById('taskDesc').value     = '';
  document.getElementById('taskDue').value      = prefilledDate || '';
  document.getElementById('taskPriority').value = 'medium';
  populateCategorySelects();

  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    document.getElementById('modalTitle').textContent   = 'Edit Task';
    document.getElementById('taskTitle').value          = task.title;
    document.getElementById('taskDesc').value           = task.description || '';
    document.getElementById('taskDue').value            = task.due || '';
    document.getElementById('taskPriority').value       = task.priority;
    document.getElementById('taskCategory').value       = task.category;
  } else {
    document.getElementById('modalTitle').textContent   = 'New Task';
    if (state.categories.length) document.getElementById('taskCategory').value = state.categories[0].id;
  }
  document.getElementById('taskModal').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('open');
  editingTaskId = null;
}

document.getElementById('modalClose').addEventListener('click',  closeTaskModal);
document.getElementById('modalCancel').addEventListener('click', closeTaskModal);
document.getElementById('taskModal').addEventListener('click', e => { if (e.target===document.getElementById('taskModal')) closeTaskModal(); });
document.getElementById('modalSave').addEventListener('click',   saveTask);
document.getElementById('taskTitle').addEventListener('keydown', e => { if (e.key==='Enter') saveTask(); });

async function saveTask() {
  const title    = document.getElementById('taskTitle').value.trim();
  const desc     = document.getElementById('taskDesc').value.trim();
  const due      = document.getElementById('taskDue').value;
  const priority = document.getElementById('taskPriority').value;
  const category = document.getElementById('taskCategory').value;
  if (!title) { showToast('Please enter a task title.', 'warning'); return; }

  try {
    if (editingTaskId) {
      await userCol('tasks').doc(editingTaskId).update({ title, description:desc, due, priority, category, updatedAt: Date.now() });
      logActivity(`Edited: "${title}"`, '#6366f1');
      showToast('Task updated!', 'info');
    } else {
      await userCol('tasks').add({ title, description:desc, due, priority, category, completed:false, createdAt:Date.now(), updatedAt:Date.now() });
      logActivity(`Added: "${title}"`, '#10b981');
      showToast('Task added!', 'success');
    }
    closeTaskModal();
    checkUpcomingReminders();
  } catch (e) {
    console.error(e);
    showToast('Failed to save task. Check your connection.', 'error');
  }
}

// ─────────────────────────────────────────────
// TASK ACTIONS
// ─────────────────────────────────────────────
async function toggleComplete(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const newVal = !task.completed;
  try {
    await userCol('tasks').doc(taskId).update({ completed: newVal, updatedAt: Date.now() });
    logActivity(newVal ? `Completed: "${task.title}"` : `Reopened: "${task.title}"`, newVal ? '#10b981' : '#f59e0b');
    showToast(newVal ? 'Task completed! 🎉' : 'Task marked as pending.', newVal ? 'success' : 'info');
  } catch (e) {
    showToast('Failed to update task.', 'error');
  }
}

async function deleteTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  try {
    await userCol('tasks').doc(taskId).delete();
    logActivity(`Deleted: "${task.title}"`, '#ef4444');
    showToast('Task deleted.', 'error');
    if (document.getElementById('detailModal').classList.contains('open')) closeDetailModal();
  } catch (e) {
    showToast('Failed to delete task.', 'error');
  }
}

// ─────────────────────────────────────────────
// TASK DETAIL MODAL
// ─────────────────────────────────────────────
let detailTaskId = null;

function openDetailModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  detailTaskId = taskId;
  const cat     = getCategory(task.category);
  const overdue = !task.completed && isOverdue(task.due);
  const priorityLabel = { high:'🔴 High', medium:'🟡 Medium', low:'🟢 Low' };
  document.getElementById('detailTitle').textContent = task.title;
  document.getElementById('detailBody').innerHTML = `
    ${task.description ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value detail-desc">${escHtml(task.description)}</span></div>` : ''}
    <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="badge ${task.completed?'badge-low':'badge-medium'}">${task.completed?'✅ Completed':'⏳ Pending'}</span></span></div>
    <div class="detail-row"><span class="detail-label">Priority</span><span class="detail-value"><span class="badge badge-${task.priority}">${priorityLabel[task.priority]}</span></span></div>
    ${cat ? `<div class="detail-row"><span class="detail-label">Category</span><span class="detail-value"><span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}">${cat.name}</span></span></div>` : ''}
    <div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-value">${task.due?`<span class="badge ${overdue?'badge-overdue':'badge-due'}">${overdue?'⚠️ ':''}${formatDate(task.due)}</span>`:'<span style="color:var(--text-muted)">No due date</span>'}</span></div>
    <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value" style="color:var(--text-muted);font-size:.85rem">${new Date(task.createdAt).toLocaleString()}</span></div>`;
  document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() { document.getElementById('detailModal').classList.remove('open'); detailTaskId = null; }
document.getElementById('detailClose').addEventListener('click', closeDetailModal);
document.getElementById('detailModal').addEventListener('click', e => { if (e.target===document.getElementById('detailModal')) closeDetailModal(); });
document.getElementById('detailEdit').addEventListener('click', () => { const id=detailTaskId; closeDetailModal(); openTaskModal(id); });
document.getElementById('detailDelete').addEventListener('click', () => { if (detailTaskId) deleteTask(detailTaskId); });

// ─────────────────────────────────────────────
// ADD TASK BUTTONS
// ─────────────────────────────────────────────
document.getElementById('topbarAddTask').addEventListener('click', () => openTaskModal());
document.getElementById('tasksAddBtn').addEventListener('click',   () => openTaskModal());
document.getElementById('todayAddBtn').addEventListener('click',   () => openTaskModal(null, todayStr()));

// ─────────────────────────────────────────────
// CATEGORY MODAL
// ─────────────────────────────────────────────
let selectedColor = COLOR_PALETTE[0];

function openCatModal() {
  document.getElementById('catName').value = '';
  selectedColor = COLOR_PALETTE[0];
  buildColorPicker();
  document.getElementById('catModal').classList.add('open');
  document.getElementById('catName').focus();
}
function closeCatModal() { document.getElementById('catModal').classList.remove('open'); }

function buildColorPicker() {
  const picker = document.getElementById('colorPicker');
  picker.innerHTML = '';
  COLOR_PALETTE.forEach(color => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (color===selectedColor?' selected':'');
    sw.style.background = color;
    sw.addEventListener('click', () => {
      selectedColor = color;
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    picker.appendChild(sw);
  });
}

document.getElementById('addCategoryBtn').addEventListener('click', openCatModal);
document.getElementById('catModalClose').addEventListener('click', closeCatModal);
document.getElementById('catCancel').addEventListener('click', closeCatModal);
document.getElementById('catModal').addEventListener('click', e => { if (e.target===document.getElementById('catModal')) closeCatModal(); });
document.getElementById('catName').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('catSave').click(); });

document.getElementById('catSave').addEventListener('click', async () => {
  const name = document.getElementById('catName').value.trim();
  if (!name) { showToast('Please enter a category name.', 'warning'); return; }
  const newCat = { id: genId(), name, color: selectedColor };
  const updated = [...state.categories, newCat];
  try {
    await userDoc().update({ categories: updated });
    closeCatModal();
    showToast(`Category "${name}" added!`, 'success');
  } catch (e) {
    showToast('Failed to save category.', 'error');
  }
});

// ─────────────────────────────────────────────
// REMINDERS
// ─────────────────────────────────────────────
function checkUpcomingReminders() {
  const tmr    = new Date(); tmr.setDate(tmr.getDate()+1);
  const tmrStr = tmr.toISOString().slice(0,10);
  const due    = state.tasks.filter(t => !t.completed && t.due===tmrStr);
  if (due.length===1)    showToast(`⏰ "${due[0].title}" is due tomorrow!`, 'warning', 5000);
  else if (due.length>1) showToast(`⏰ ${due.length} tasks are due tomorrow!`, 'warning', 5000);
}

// ─────────────────────────────────────────────
// REFRESH ALL
// ─────────────────────────────────────────────
function refreshAll() {
  updateStats();
  renderCategorySidebar();
  const activeView = document.querySelector('.view.active');
  if (activeView) renderView(activeView.id.replace('view-', ''));
}

// ─────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeTaskModal(); closeDetailModal(); closeCatModal(); closeSidebar(); closeRoutineModal(); }
  if ((e.ctrlKey||e.metaKey) && e.key==='n' && currentUser) { e.preventDefault(); openTaskModal(); }
});

// ─────────────────────────────────────────────
// ROUTINES VIEW
// ─────────────────────────────────────────────
function renderRoutines() {
  const grid = document.getElementById('routinesGrid');
  grid.innerHTML = '';

  if ('Notification' in window && Notification.permission==='default') {
    const banner = document.createElement('div');
    banner.className = 'notif-banner';
    banner.style.gridColumn = '1 / -1';
    banner.innerHTML = `<i class="fa-solid fa-bell"></i><span>Enable browser notifications for interval reminders.</span><button id="enableNotifBtn">Enable</button>`;
    grid.appendChild(banner);
    document.getElementById('enableNotifBtn').addEventListener('click', requestNotifPermission);
  }

  if (!state.routines.length) {
    const empty = document.createElement('div');
    empty.className = 'routines-empty';
    empty.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔔</div><h3>No routines yet</h3><p>Create a routine to auto-add tasks daily.</p></div>`;
    grid.appendChild(empty);
    return;
  }
  state.routines.forEach(r => grid.appendChild(buildRoutineCard(r)));
  updateRoutinesBadge();
}

function buildRoutineCard(routine) {
  const cat = getCategory(routine.category);
  const priorityLabel = { high:'🔴 High', medium:'🟡 Medium', low:'🟢 Low' };
  const card = document.createElement('div');
  card.className = `routine-card priority-${routine.priority} ${routine.active?'':'paused'}`;
  card.dataset.rid = routine.id;

  const daysHtml = DAY_NAMES.map((d,i) =>
    `<span class="rday ${routine.days.includes(i)?'on':''}">${d}</span>`).join('');

  let intervalHtml = '';
  if (routine.hasInterval) {
    const hrs   = routine.intervalHours;
    const label = hrs<1 ? `${hrs*60} min` : `${hrs} hr`;
    const win   = routine.window_!=='all' ? ` · ${routine.window_}` : '';
    const next  = getNextFireLabel(routine);
    intervalHtml = `<div class="routine-interval-info"><i class="fa-solid fa-bell"></i><span>Every ${label}${win}</span>${next?`<span class="routine-countdown" style="margin-left:auto"><i class="fa-regular fa-clock"></i> ${next}</span>`:''}</div>`;
  }

  card.innerHTML = `
    <div class="routine-card-header">
      <div class="routine-icon"><i class="fa-solid ${routineIcon(routine.category)}"></i></div>
      <div class="routine-info">
        <div class="routine-name">${escHtml(routine.title)}</div>
        ${routine.description?`<div class="routine-desc-text">${escHtml(routine.description)}</div>`:''}
        <div class="routine-meta">
          <span class="badge badge-${routine.priority}">${priorityLabel[routine.priority]}</span>
          ${cat?`<span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}">${cat.name}</span>`:''}
          ${routine.hasInterval?'<span class="badge" style="background:var(--accent-light);color:var(--accent)"><i class="fa-solid fa-bell"></i> Interval</span>':''}
        </div>
      </div>
    </div>
    <div class="routine-days">${daysHtml}</div>
    ${intervalHtml}
    <div class="routine-card-footer">
      <span class="routine-status-label">${routine.active?'✅ Active':'⏸ Paused'}</span>
      <div class="routine-actions">
        <button class="task-btn routine-edit-btn" title="Edit" data-rid="${routine.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="task-btn del routine-del-btn" title="Delete" data-rid="${routine.id}"><i class="fa-solid fa-trash"></i></button>
        <label class="alarm-toggle" title="${routine.active?'Pause':'Activate'}">
          <input type="checkbox" class="routine-toggle-chk" data-rid="${routine.id}" ${routine.active?'checked':''} />
          <span class="alarm-slider"></span>
        </label>
      </div>
    </div>`;

  card.querySelector('.routine-toggle-chk').addEventListener('change', e => toggleRoutineActive(routine.id, e.target.checked));
  card.querySelector('.routine-edit-btn').addEventListener('click',  () => openRoutineModal(routine.id));
  card.querySelector('.routine-del-btn').addEventListener('click',   () => deleteRoutine(routine.id));
  return card;
}

function getNextFireLabel(routine) {
  if (!routine.active || !routine.hasInterval) return '';
  const now      = Date.now();
  const last     = routine.lastNotified || (now - routine.intervalHours*3600000);
  const nextFire = last + routine.intervalHours*3600000;
  const diffMs   = nextFire - now;
  if (diffMs<=0) return 'soon';
  const diffMin = Math.round(diffMs/60000);
  return diffMin<60 ? `${diffMin}m` : `${Math.round(diffMin/60)}h`;
}

function updateRoutinesBadge() {
  const badge  = document.getElementById('routinesBadge');
  const active = state.routines.filter(r => r.active).length;
  badge.textContent    = active;
  badge.style.display  = active>0 ? 'inline-block' : 'none';
}

async function toggleRoutineActive(id, active) {
  try {
    await userCol('routines').doc(id).update({ active, lastNotified: active ? Date.now() : 0 });
    const r = state.routines.find(r=>r.id===id);
    logActivity(active ? `Activated routine: "${r?.title}"` : `Paused routine: "${r?.title}"`, active?'#6366f1':'#9ca3af');
    showToast(active ? `Routine activated 🔔` : `Routine paused.`, active?'success':'info');
  } catch (e) { showToast('Failed to update routine.', 'error'); }
}

async function deleteRoutine(id) {
  const r = state.routines.find(r=>r.id===id);
  try {
    await userCol('routines').doc(id).delete();
    logActivity(`Deleted routine: "${r?.title}"`, '#ef4444');
    showToast(`Routine deleted.`, 'error');
  } catch (e) { showToast('Failed to delete routine.', 'error'); }
}

// Auto-add routine tasks for today
async function autoAddRoutineTasks() {
  if (!currentUser) return;
  const today     = todayStr();
  const dayOfWeek = new Date().getDay();
  const batch     = db.batch();
  let added       = 0;

  state.routines.forEach(r => {
    if (!r.active) return;
    if (!r.days.includes(dayOfWeek)) return;
    if (r.lastAutoAdded === today) return;

    const ref = userCol('tasks').doc();
    batch.set(ref, {
      title:       r.title, description: r.description||'',
      due:         today,   priority:    r.priority,
      category:    r.category, completed: false,
      fromRoutine: r.id,   createdAt:   Date.now(), updatedAt: Date.now(),
    });
    const routineRef = userCol('routines').doc(r.id);
    batch.update(routineRef, { lastAutoAdded: today });
    added++;
  });

  if (added>0) {
    await batch.commit().catch(e => console.error('Auto-add batch error:', e));
    showToast(`${added} routine task${added>1?'s':''} added for today 📅`, 'info', 4000);
    logActivity(`Auto-added ${added} routine task(s) for today`, '#6366f1');
  }
}

// Midnight refresh scheduler
function scheduleMidnightRefresh() {
  const now      = new Date();
  const midnight = new Date(now); midnight.setHours(24,0,30,0);
  setTimeout(() => { autoAddRoutineTasks(); scheduleMidnightRefresh(); }, midnight-now);
}

// Interval ticker — checks every 60s
function startRoutineTicker() {
  if (routineTickerHandle) clearInterval(routineTickerHandle);
  routineTickerHandle = setInterval(checkIntervalReminders, 60*1000);
  setTimeout(checkIntervalReminders, 5000);
}

function checkIntervalReminders() {
  const now         = Date.now();
  const currentHHMM = new Date().toTimeString().slice(0,5);
  state.routines.forEach(r => {
    if (!r.active || !r.hasInterval) return;
    const win   = WINDOW_MAP[r.window_||'all'];
    const start = r.startTime || win.start;
    const end   = r.endTime   || win.end;
    if (currentHHMM<start || currentHHMM>end) return;
    const intervalMs = r.intervalHours*3600*1000;
    const last       = r.lastNotified||0;
    if (now-last < intervalMs) return;
    // Fire!
    userCol('routines').doc(r.id).update({ lastNotified: now }).catch(()=>{});
    showToast(`⏰ ${r.title} — time for your reminder!`, 'info', 6000);
    if (Notification.permission==='granted') {
      try { new Notification('Taskflow Reminder', { body: r.title+(r.description?'\n'+r.description:''), tag:'routine-'+r.id }); } catch(e){}
    }
  });
}

function requestNotifPermission() {
  if (!('Notification' in window)) { showToast('Notifications not supported in this browser.','error'); return; }
  Notification.requestPermission().then(perm => {
    if (perm==='granted') { showToast('Notifications enabled! 🔔','success'); renderRoutines(); }
    else showToast('Notifications blocked. Enable them in browser settings.','warning',5000);
  });
}

// ─────────────────────────────────────────────
// ROUTINE MODAL
// ─────────────────────────────────────────────
let editingRoutineId = null;

function openRoutineModal(routineId=null) {
  editingRoutineId = routineId;
  document.getElementById('routineTitle').value    = '';
  document.getElementById('routineDesc').value     = '';
  document.getElementById('routinePriority').value = 'medium';
  document.getElementById('routineHasInterval').checked = false;
  document.getElementById('intervalOptions').style.display = 'none';
  document.getElementById('routineInterval').value  = '2';
  document.getElementById('routineWindow').value    = 'all';
  document.getElementById('routineStartTime').value = '';
  document.getElementById('routineEndTime').value   = '';
  document.querySelectorAll('.day-btn').forEach(b => b.classList.add('active'));
  populateCategorySelects();
  if (state.categories.length) document.getElementById('routineCategory').value = state.categories[0].id;

  if (routineId) {
    const r = state.routines.find(r=>r.id===routineId);
    if (!r) return;
    document.getElementById('routineModalTitle').textContent = 'Edit Routine';
    document.getElementById('routineTitle').value    = r.title;
    document.getElementById('routineDesc').value     = r.description||'';
    document.getElementById('routinePriority').value = r.priority;
    document.getElementById('routineCategory').value = r.category;
    document.getElementById('routineHasInterval').checked = r.hasInterval;
    document.getElementById('intervalOptions').style.display = r.hasInterval?'block':'none';
    document.getElementById('routineInterval').value  = String(r.intervalHours||2);
    document.getElementById('routineWindow').value    = r.window_||'all';
    document.getElementById('routineStartTime').value = r.startTime||'';
    document.getElementById('routineEndTime').value   = r.endTime||'';
    document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', r.days.includes(parseInt(b.dataset.day))));
  } else {
    document.getElementById('routineModalTitle').textContent = 'New Routine';
  }
  document.getElementById('routineModal').classList.add('open');
  document.getElementById('routineTitle').focus();
}

function closeRoutineModal() { document.getElementById('routineModal').classList.remove('open'); editingRoutineId=null; }

document.getElementById('routineHasInterval').addEventListener('change', e => {
  document.getElementById('intervalOptions').style.display = e.target.checked?'block':'none';
});
document.querySelectorAll('.day-btn').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('active')));
document.getElementById('routinesAddBtn').addEventListener('click', () => openRoutineModal());
document.getElementById('routineModalClose').addEventListener('click', closeRoutineModal);
document.getElementById('routineCancel').addEventListener('click',    closeRoutineModal);
document.getElementById('routineModal').addEventListener('click', e => { if (e.target===document.getElementById('routineModal')) closeRoutineModal(); });
document.getElementById('routineSave').addEventListener('click', saveRoutine);

async function saveRoutine() {
  const title       = document.getElementById('routineTitle').value.trim();
  const desc        = document.getElementById('routineDesc').value.trim();
  const priority    = document.getElementById('routinePriority').value;
  const category    = document.getElementById('routineCategory').value;
  const hasInterval = document.getElementById('routineHasInterval').checked;
  const intervalHrs = parseFloat(document.getElementById('routineInterval').value)||2;
  const window_     = document.getElementById('routineWindow').value;
  const startTime   = document.getElementById('routineStartTime').value;
  const endTime     = document.getElementById('routineEndTime').value;
  const days        = [...document.querySelectorAll('.day-btn.active')].map(b=>parseInt(b.dataset.day));

  if (!title) { showToast('Please enter a routine title.','warning'); return; }
  if (!days.length) { showToast('Select at least one active day.','warning'); return; }

  const data = { title, description:desc, priority, category, days, hasInterval,
    intervalHours:intervalHrs, window_:window_, startTime, endTime };

  try {
    if (editingRoutineId) {
      await userCol('routines').doc(editingRoutineId).update({ ...data, lastNotified:0 });
      logActivity(`Updated routine: "${title}"`, '#6366f1');
      showToast('Routine updated!', 'info');
    } else {
      const newRef = await userCol('routines').add({ ...data, active:true, lastAutoAdded:null, lastNotified:0, createdAt:Date.now() });
      logActivity(`Created routine: "${title}"`, '#6366f1');
      showToast(`Routine "${title}" created! 🔔`, 'success');
      // Auto-add to today if active today
      const todayDay = new Date().getDay();
      if (days.includes(todayDay)) {
        await userCol('tasks').add({ title, description:desc, due:todayStr(), priority, category, completed:false, fromRoutine:newRef.id, createdAt:Date.now(), updatedAt:Date.now() });
        await newRef.update({ lastAutoAdded: todayStr() });
        showToast(`"${title}" added to today's tasks!`, 'info', 3500);
      }
    }
    if (hasInterval && Notification.permission==='default') requestNotifPermission();
    closeRoutineModal();
  } catch(e) {
    console.error(e);
    showToast('Failed to save routine.', 'error');
  }
}

// ─────────────────────────────────────────────
// INIT MESSAGE
// ─────────────────────────────────────────────
console.log('%cTaskflow (Firebase Edition) ready ⚡', 'font-size:16px;font-weight:bold;color:#6366f1;');
