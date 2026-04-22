// ============================================================
// Incoin Assistant — Dashboard Logic (ES Module)
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://zuqohqbkmkcxzxcnsbyr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cW9ocWJrbWtjeHp4Y25zYnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2Njc0MDYsImV4cCI6MjA5MjI0MzQwNn0.--I4APXoZXPCkjWb0AZmxk6PW5m1-PIfixZ31AJgsos';
const RZP_KEY_ID   = 'rzp_live_SPyQe1cDlxCPpR';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FN_ORDER  = `${SUPABASE_URL}/functions/v1/razorpay-order`;
const FN_VERIFY = `${SUPABASE_URL}/functions/v1/razorpay-verify`;

// ─── State ───────────────────────────────────────────────────
let currentUser   = null;
let accessToken   = null;
let profile       = null;
let allTasks      = [];
let currentFilter = 'all';
let currentSort   = 'newest';
let searchQuery   = '';
let taskEditId    = null;

// ─── Init ─────────────────────────────────────────────────────
(async () => {
  setupUI();
  const { data: { session }, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !session) { window.location.href = 'auth.html'; return; }
  currentUser = session.user;
  accessToken = session.access_token;
  await loadProfile();
  await loadOverview();
})();

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) window.location.href = 'auth.html';
  else accessToken = session.access_token;
});

document.getElementById('signOutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// ─── Profile ──────────────────────────────────────────────────
async function loadProfile() {
  let { data, error } = await supabase
    .from('profiles').select('*').eq('id', currentUser.id).maybeSingle();

  if (error) { console.error('Profile fetch error:', error); toast('Could not load profile.', 'error'); return; }

  if (!data) {
    const { data: np, error: ie } = await supabase
      .from('profiles')
      .upsert({ id: currentUser.id, email: currentUser.email,
        full_name: currentUser.user_metadata?.full_name || '',
        credits: 5, total_spent: 0, status: 'active' }, { onConflict: 'id' })
      .select().single();
    if (ie) { console.error('Profile create error:', ie); toast('Could not initialise profile.', 'error'); return; }
    data = np;
    await supabase.from('activity_log').insert({
      user_id: currentUser.id, action: 'credit_added',
      detail: 'Welcome bonus — 5 free credits added to your account',
    });
  }
  profile = data;
  renderProfile();
}

function renderProfile() {
  if (!profile) return;
  const name     = profile.full_name?.trim() || profile.email.split('@')[0];
  const initials = name.slice(0, 2).toUpperCase();
  document.getElementById('sidebarName').textContent       = name;
  document.getElementById('sidebarEmail').textContent      = profile.email;
  document.getElementById('userAvatarSidebar').textContent = initials;
  document.getElementById('topbarCredits').textContent     = profile.credits;
  document.getElementById('statCredits').textContent       = profile.credits;
  document.getElementById('statSpent').textContent         = `₹${Number(profile.total_spent).toFixed(0)}`;
}

// ─── Overview ─────────────────────────────────────────────────
async function loadOverview() {
  await Promise.all([loadTaskStats(), loadRecentTasks(3), loadRecentActivity(5)]);
}

async function loadTaskStats() {
  const { data, error } = await supabase.from('tasks').select('id, status').eq('user_id', currentUser.id);
  if (error) { console.error('Task stats error:', error); return; }
  document.getElementById('statTasks').textContent     = data.length;
  document.getElementById('statCompleted').textContent = data.filter(t => t.status === 'completed').length;
}

async function loadRecentTasks(limit = 999) {
  const { data, error } = await supabase
    .from('tasks').select('*').eq('user_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('Tasks error:', error); return; }
  if (limit === 3) {
    renderTasks(data || [], 'overviewTasks');
  } else {
    allTasks = data || [];
    renderFilteredTasks();
    updateTaskStatsBar();
    updateNavBadge();
  }
}

async function loadRecentActivity(limit = 999) {
  const { data, error } = await supabase
    .from('activity_log').select('*').eq('user_id', currentUser.id)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('Activity error:', error); return; }
  renderActivity(data || [], limit === 5 ? 'overviewActivity' : 'activityList');
}

// ─── Stats Bar ────────────────────────────────────────────────
function updateTaskStatsBar() {
  const total = allTasks.length;
  const pend  = allTasks.filter(t => t.status === 'pending' || t.status === 'processing').length;
  const prog  = allTasks.filter(t => t.status === 'in_progress').length;
  const done  = allTasks.filter(t => t.status === 'completed').length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('tsTotal',      total);
  set('tsPending',    pend);
  set('tsInProgress', prog);
  set('tsDone',       done);
  set('completionPct', `${pct}%`);

  const arc = document.getElementById('completionArc');
  if (arc) {
    const circumference = 119.4;
    arc.style.strokeDashoffset = circumference - (circumference * pct / 100);
  }
}

// ─── Render Overview Tasks (compact rows) ─────────────────────
function renderTasks(tasks, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!tasks.length) { el.innerHTML = '<div class="empty-state">No tasks yet.</div>'; return; }
  el.innerHTML = tasks.map(t => `
    <div class="item-row">
      <span class="item-dot ${t.status}"></span>
      <div class="item-main">
        <div class="item-title">${escHtml(t.title)}</div>
        <div class="item-sub">${timeAgo(t.created_at)}</div>
      </div>
      <span class="item-badge ${t.status}">${statusLabel(t.status)}</span>
    </div>`).join('');
}

// ─── Render Full Task List ─────────────────────────────────────
function renderFilteredTasks() {
  let tasks = [...allTasks];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  if (currentFilter !== 'all') tasks = tasks.filter(t => t.status === currentFilter);

  const priOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  if (currentSort === 'due_date') {
    tasks.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  } else if (currentSort === 'priority') {
    tasks.sort((a, b) => (priOrder[a.priority || 'medium'] ?? 2) - (priOrder[b.priority || 'medium'] ?? 2));
  }

  renderTasksFull(tasks, 'tasksList');
  updateFilterCounts();
}

function updateFilterCounts() {
  const counts = { all: allTasks.length, pending: 0, in_progress: 0, completed: 0 };
  allTasks.forEach(t => {
    if (t.status === 'pending' || t.status === 'processing') counts.pending++;
    else if (t.status in counts) counts[t.status]++;
  });
  const labels = { all: 'All', pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
  document.querySelectorAll('.filter-tab').forEach(tab => {
    const f = tab.dataset.filter;
    tab.textContent = `${labels[f]} (${counts[f] ?? 0})`;
  });
}

const CAT_LABELS = { general: 'General', data: 'Data', research: 'Research', design: 'Design', development: 'Dev', writing: 'Writing' };

function renderTasksFull(tasks, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!tasks.length) {
    const isSearch  = searchQuery.length > 0;
    const isFiltered = currentFilter !== 'all';
    const msg  = isSearch ? `No tasks match "${escHtml(searchQuery)}"` :
                 isFiltered ? `No ${currentFilter.replace('_', ' ')} tasks yet` :
                 'No tasks yet';
    const sub  = isSearch || isFiltered ? 'Try a different filter or search term.' : 'Create your first task to start tracking your work.';
    el.innerHTML = `
      <div class="task-empty-state">
        <div class="task-empty-icon">○</div>
        <div class="task-empty-title">${msg}</div>
        <div class="task-empty-sub">${sub}</div>
        ${!isSearch && !isFiltered ? `<button class="btn btn-primary" style="font-size:0.85rem;padding:10px 20px;" onclick="document.getElementById('newTaskBtn').click()">+ New Task</button>` : ''}
      </div>`;
    return;
  }

  el.innerHTML = tasks.map(t => {
    const priority = t.priority || 'medium';
    const category = t.category || 'general';
    const progress = t.progress ?? 0;
    const status   = t.status   || 'pending';
    const dueStr   = t.due_date ? formatDueDate(t.due_date) : '';
    const overdue  = t.due_date && isDueOverdue(t.due_date) && status !== 'completed';
    const catLabel = CAT_LABELS[category] || category;

    let actionBtn = '';
    if (status === 'pending' || status === 'processing')
      actionBtn = `<button class="task-action start"   onclick="updateTaskStatus('${t.id}','in_progress')">▶ Start</button>`;
    else if (status === 'in_progress')
      actionBtn = `<button class="task-action complete" onclick="updateTaskStatus('${t.id}','completed')">✓ Done</button>`;
    else if (status === 'completed')
      actionBtn = `<button class="task-action reopen"   onclick="updateTaskStatus('${t.id}','pending')">↩ Reopen</button>`;

    const descHtml = t.description
      ? `<div class="task-item-desc">${escHtml(t.description)}</div>` : '';

    const showProgress = status === 'in_progress' || (status === 'completed' && progress > 0);
    const progressHtml = showProgress ? `
      <div class="task-progress-section">
        <div class="task-progress-track">
          <div class="task-progress-fill ${status}" style="width:${progress}%"></div>
        </div>
        <span class="task-progress-pct" id="pct-${t.id}">${progress}%</span>
        ${status === 'in_progress' ? `<input type="range" class="progress-slider" min="0" max="100" value="${progress}"
          oninput="previewProgress('${t.id}',this.value)"
          onchange="updateTaskProgress('${t.id}',this.value)" />` : ''}
      </div>` : '';

    const safeTitle = t.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `
      <div class="task-item" data-id="${t.id}" data-priority="${priority}" data-status="${status}">
        <div class="task-item-main">
          <button class="task-check-btn" onclick="toggleTaskComplete('${t.id}')" title="${status === 'completed' ? 'Reopen task' : 'Mark complete'}">✓</button>
          <div class="task-item-content">
            <span class="task-item-title">${escHtml(t.title)}</span>
            ${descHtml}
            <div class="task-item-meta">
              <span class="priority-tag ${priority}">${priority}</span>
              <span class="cat-chip">${catLabel}</span>
              ${dueStr ? `<span class="due-chip${overdue ? ' overdue' : ''}">◷ ${dueStr}</span>` : ''}
              <span class="time-chip">${timeAgo(t.created_at)}</span>
            </div>
          </div>
          <div class="task-item-actions">
            <span class="status-pill ${status}">${statusLabel(status)}</span>
            ${actionBtn}
            <button class="task-icon-btn edit"   onclick="openEditTask('${t.id}')"                            title="Edit task">✏</button>
            <button class="task-icon-btn delete" onclick="confirmDeleteTask('${t.id}','${safeTitle}')"        title="Delete task">✕</button>
          </div>
        </div>
        ${progressHtml}
      </div>`;
  }).join('');
}

// ─── Render Activity ──────────────────────────────────────────
function renderActivity(logs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!logs.length) { el.innerHTML = '<div class="empty-state">No activity recorded yet.</div>'; return; }
  el.innerHTML = logs.map(l => `
    <div class="item-row">
      <span class="item-dot ${l.action.includes('credit') ? 'purchase' : 'processing'}"></span>
      <div class="item-main">
        <div class="item-title">${escHtml(l.detail || l.action)}</div>
        <div class="item-sub">${timeAgo(l.created_at)}</div>
      </div>
    </div>`).join('');
}

// ─── UI Setup ─────────────────────────────────────────────────
function setupUI() {
  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-tab]');
    if (navEl) { e.preventDefault(); switchTab(navEl.dataset.tab); return; }
    const sidebar = document.getElementById('sidebar');
    const toggle  = document.getElementById('sidebarToggle');
    if (sidebar?.classList.contains('open') && !sidebar.contains(e.target) && !toggle?.contains(e.target))
      sidebar.classList.remove('open');
  });

  document.getElementById('sidebarToggle')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));

  document.getElementById('newTaskBtn')?.addEventListener('click', () => openTaskModal());
  document.getElementById('closeTaskModal')?.addEventListener('click', closeTaskModal);
  document.getElementById('cancelTaskBtn')?.addEventListener('click', closeTaskModal);
  document.getElementById('newTaskModal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTaskModal(); });
  document.getElementById('submitTaskBtn')?.addEventListener('click', handleTaskSubmit);

  document.querySelectorAll('.filter-tab').forEach(tab =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderFilteredTasks();
    })
  );

  document.getElementById('taskSort')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderFilteredTasks();
  });

  document.getElementById('taskSearchInput')?.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderFilteredTasks();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      const tasksPanel = document.getElementById('tab-tasks');
      if (tasksPanel?.classList.contains('active')) {
        e.preventDefault();
        openTaskModal();
      }
    }
    if (e.key === 'Escape') closeTaskModal();
  });
}

function updateNavBadge() {
  const active = allTasks.filter(t => t.status !== 'completed').length;
  const el = document.getElementById('navBadgeTasks');
  if (!el) return;
  el.textContent = active > 0 ? active : '';
  el.style.display = active > 0 ? 'inline-flex' : 'none';
}

function switchTab(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.toggle('active', el.id === `tab-${tab}`));
  const titles = { overview: 'Overview', tasks: 'My Tasks', credits: 'Buy Credits', activity: 'Activity Log' };
  const titleEl = document.getElementById('tabTitle');
  if (titleEl) titleEl.textContent = titles[tab] || '';
  if (!currentUser) return;
  if (tab === 'tasks')    loadRecentTasks();
  if (tab === 'activity') loadRecentActivity();
}

// ─── Task Modal (create + edit) ───────────────────────────────
function openTaskModal(task = null) {
  taskEditId = task ? task.id : null;
  const isEdit = !!task;

  document.getElementById('taskModalTitle').textContent   = isEdit ? 'Edit Task'           : 'Create New Task';
  document.getElementById('submitTaskBtn').textContent    = isEdit ? 'Save Changes'         : 'Create Task (1 credit)';
  document.getElementById('taskCreditNote').style.display = isEdit ? 'none'                 : '';

  document.getElementById('taskTitle').value    = task?.title       || '';
  document.getElementById('taskDesc').value     = task?.description || '';
  document.getElementById('taskPriority').value = task?.priority    || 'medium';
  document.getElementById('taskCategory').value = task?.category    || 'general';
  document.getElementById('taskDueDate').value  = task?.due_date    || '';

  document.getElementById('taskError').style.display = 'none';
  document.getElementById('newTaskModal').classList.add('active');
  document.getElementById('taskTitle').focus();
}

function closeTaskModal() {
  taskEditId = null;
  document.getElementById('newTaskModal').classList.remove('active');
  document.getElementById('taskModalTitle').textContent   = 'Create New Task';
  document.getElementById('submitTaskBtn').textContent    = 'Create Task (1 credit)';
  document.getElementById('taskCreditNote').style.display = '';
  document.getElementById('taskTitle').value    = '';
  document.getElementById('taskDesc').value     = '';
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('taskCategory').value = 'general';
  document.getElementById('taskDueDate').value  = '';
  document.getElementById('taskError').style.display = 'none';
}

async function handleTaskSubmit() {
  if (taskEditId) await saveTaskEdit();
  else            await createTask();
}

async function createTask() {
  const title    = document.getElementById('taskTitle').value.trim();
  const desc     = document.getElementById('taskDesc').value.trim();
  const priority = document.getElementById('taskPriority').value || 'medium';
  const category = document.getElementById('taskCategory').value || 'general';
  const dueDate  = document.getElementById('taskDueDate').value  || null;
  const errEl    = document.getElementById('taskError');

  if (!title) { showFormError(errEl, 'Please enter a task title.'); return; }
  if (!profile || profile.credits < 1) { showFormError(errEl, 'Insufficient credits. Please purchase a plan first.'); return; }

  const btn = document.getElementById('submitTaskBtn');
  btn.textContent = 'Creating…'; btn.disabled = true;

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({ user_id: currentUser.id, title, description: desc || null, priority, category, due_date: dueDate, progress: 0 })
    .select().single();

  if (error) {
    console.error('Task insert error:', error);
    showFormError(errEl, 'Failed to create task. Please try again.');
    btn.textContent = 'Create Task (1 credit)'; btn.disabled = false;
    return;
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('use_credits', {
    p_user_id: currentUser.id, p_task_id: task.id, p_credits: 1, p_note: `Task: ${title}`,
  });
  if (rpcErr) console.error('use_credits RPC error:', rpcErr);
  if (rpcResult?.success) {
    profile.credits = rpcResult.new_balance;
    document.getElementById('topbarCredits').textContent = rpcResult.new_balance;
    document.getElementById('statCredits').textContent   = rpcResult.new_balance;
  }

  closeTaskModal();
  btn.textContent = 'Create Task (1 credit)'; btn.disabled = false;
  toast(`Task "${title}" created!`, 'success');
  await loadRecentTasks();
  await loadTaskStats();
}

async function saveTaskEdit() {
  const title    = document.getElementById('taskTitle').value.trim();
  const desc     = document.getElementById('taskDesc').value.trim();
  const priority = document.getElementById('taskPriority').value || 'medium';
  const category = document.getElementById('taskCategory').value || 'general';
  const dueDate  = document.getElementById('taskDueDate').value  || null;
  const errEl    = document.getElementById('taskError');

  if (!title) { showFormError(errEl, 'Please enter a task title.'); return; }

  const btn = document.getElementById('submitTaskBtn');
  btn.textContent = 'Saving…'; btn.disabled = true;

  const { error } = await supabase
    .from('tasks')
    .update({ title, description: desc || null, priority, category, due_date: dueDate })
    .eq('id', taskEditId).eq('user_id', currentUser.id);

  if (error) {
    console.error('Task update error:', error);
    showFormError(errEl, 'Failed to save changes. Please try again.');
    btn.textContent = 'Save Changes'; btn.disabled = false;
    return;
  }

  const task = allTasks.find(t => t.id === taskEditId);
  if (task) Object.assign(task, { title, description: desc || null, priority, category, due_date: dueDate });

  closeTaskModal();
  btn.textContent = 'Save Changes'; btn.disabled = false;
  toast('Task updated!', 'success');
  renderFilteredTasks();
}

// ─── Edit / Delete ────────────────────────────────────────────
window.openEditTask = function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (task) openTaskModal(task);
};

window.confirmDeleteTask = function(taskId, taskTitle) {
  if (!confirm(`Delete "${taskTitle}"?\nThis cannot be undone.`)) return;
  deleteTask(taskId);
};

async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('user_id', currentUser.id);
  if (error) { toast('Failed to delete task.', 'error'); return; }
  allTasks = allTasks.filter(t => t.id !== taskId);
  renderFilteredTasks();
  updateTaskStatsBar();
  updateNavBadge();
  await loadTaskStats();
  toast('Task deleted.', 'info');
}

// ─── Toggle Complete (checkbox) ───────────────────────────────
window.toggleTaskComplete = function(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const next = task.status === 'completed' ? 'pending' : 'completed';
  window.updateTaskStatus(taskId, next);
};

// ─── Status & Progress ────────────────────────────────────────
window.updateTaskStatus = async function(taskId, newStatus) {
  const updates = { status: newStatus };
  if (newStatus === 'completed') updates.progress = 100;
  if (newStatus === 'pending')   updates.progress = 0;

  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId).eq('user_id', currentUser.id);
  if (error) { toast('Failed to update task.', 'error'); return; }

  const task = allTasks.find(t => t.id === taskId);
  if (task) Object.assign(task, updates);

  const msgs = { in_progress: 'Task started!', completed: 'Task completed!', pending: 'Task reopened.' };
  toast(msgs[newStatus] || 'Task updated.', newStatus === 'completed' ? 'success' : 'info');
  renderFilteredTasks();
  updateTaskStatsBar();
  updateNavBadge();

  if (newStatus === 'completed') {
    requestAnimationFrame(() => {
      const el = document.querySelector(`.task-item[data-id="${taskId}"]`);
      if (el) { el.classList.add('just-completed'); setTimeout(() => el.classList.remove('just-completed'), 1000); }
    });
  }
  await loadTaskStats();

  supabase.from('activity_log').insert({
    user_id: currentUser.id, action: 'task_status_updated',
    detail: `Task status changed to ${newStatus.replace('_', ' ')}`,
  });
};

window.previewProgress = function(taskId, value) {
  const fill = document.querySelector(`[data-id="${taskId}"] .task-progress-fill`);
  const pct  = document.getElementById(`pct-${taskId}`);
  if (fill) fill.style.width = value + '%';
  if (pct)  pct.textContent  = value + '%';
};

let _progressTimer = null;
window.updateTaskProgress = function(taskId, value) {
  clearTimeout(_progressTimer);
  _progressTimer = setTimeout(async () => {
    const { error } = await supabase
      .from('tasks').update({ progress: parseInt(value) })
      .eq('id', taskId).eq('user_id', currentUser.id);
    if (error) { toast('Failed to save progress.', 'error'); return; }
    const task = allTasks.find(t => t.id === taskId);
    if (task) task.progress = parseInt(value);
  }, 600);
};

function showFormError(el, msg) { el.textContent = msg; el.style.display = 'block'; }

// ══════════════════════════════════════════════════════════════
// RAZORPAY PAYMENT FLOW
// ══════════════════════════════════════════════════════════════
window.initPayment = async function(planId, amountInr, planName, credits) {
  if (!currentUser) { toast('Please sign in first.', 'error'); return; }
  setPayBtnsState(true, 'Please wait…');
  toast('Preparing checkout…', 'info');

  try {
    const orderRes = await fetch(FN_ORDER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ plan_id: planId, amount_inr: amountInr, plan_name: planName }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok || !orderData.order_id) throw new Error(orderData.error || 'Could not create payment order.');

    setPayBtnsState(false);

    const rzp = new window.Razorpay({
      key: RZP_KEY_ID, amount: orderData.amount, currency: orderData.currency,
      order_id: orderData.order_id, name: 'Incoin Assistant',
      description: `${planName} — ${credits} Credits`,
      prefill: { email: profile?.email || '', name: profile?.full_name || '' },
      notes: { plan_name: planName, credits: String(credits) },
      theme: { color: '#7c3aed' }, modal: { confirm_close: true, escape: false },
      handler: async (response) => {
        toast('Payment successful! Crediting your account…', 'info');
        await verifyAndAddCredits({ ...response, plan_id: planId, amount_inr: amountInr, credits });
      },
    });
    rzp.on('payment.failed', (resp) => { toast(`Payment failed: ${resp.error.description}`, 'error'); setPayBtnsState(false); });
    rzp.open();
  } catch (err) {
    console.error('initPayment error:', err);
    toast(err.message || 'Something went wrong.', 'error');
    setPayBtnsState(false);
  }
};

async function verifyAndAddCredits({ razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, amount_inr }) {
  try {
    const res = await fetch(FN_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_id, amount_inr }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Credit verification failed.');
    profile.credits     = result.new_balance;
    profile.total_spent = Number(profile.total_spent) + amount_inr;
    document.getElementById('topbarCredits').textContent = result.new_balance;
    document.getElementById('statCredits').textContent   = result.new_balance;
    document.getElementById('statSpent').textContent     = `₹${Math.round(profile.total_spent)}`;
    toast(`✓ ${result.credits_added} credits added! Balance: ${result.new_balance}`, 'success');
    await loadRecentActivity(5);
  } catch (err) { console.error('verifyAndAddCredits error:', err); toast(err.message, 'error'); }
}

function setPayBtnsState(disabled, label = '') {
  const origLabels = ['Buy Starter', 'Buy Standard', 'Buy Professional'];
  document.querySelectorAll('.plan-card .btn').forEach((btn, i) => {
    btn.disabled = disabled;
    btn.textContent = disabled ? label : (origLabels[i] || 'Buy Plan');
  });
}

// ─── Helpers ──────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  const d     = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days  = Math.round((d - today) / 86400000);
  if (days < 0)   return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7)  return `In ${days}d`;
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function isDueOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

function statusLabel(s) {
  return { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', processing: 'Processing', failed: 'Failed' }[s] || s;
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
