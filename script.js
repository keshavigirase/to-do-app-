/* script.js — Fixed version with full functionality */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const form = $('#task-form');
  const titleInput = $('#title');
  const priorityInput = $('#priority');
  const datetimeInput = $('#datetime');
  const taskList = $('#task-list');
  const countEl = $('#count');
  const filters = $$('.filter');
  const searchInput = $('#search');
  const clearCompletedBtn = $('#clear-completed');

  const editModal = $('#edit-modal');
  const editForm = $('#edit-form');
  const editInput = $('#edit-input');
  const editPriority = $('#edit-priority');
  const editDatetime = $('#edit-datetime');
  const cancelEdit = $('#cancel-edit');

  const statsBar = $('#stats');
  const sortSelect = $('#sort-select');
  const aiSummaryBtn = $('#ai-summary');
  const voiceHelpBtn = $('#voice-help');

  let tasks = [];
  let filter = 'all';
  let editingId = null;
  const LS_KEY = 'skillcraft_todos_v2';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (s = '') =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatDateTime = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityClass = (p) =>
    p === 'high' ? 'p-high' : p === 'medium' ? 'p-medium' : 'p-low';

  const save = () => localStorage.setItem(LS_KEY, JSON.stringify(tasks));
  const load = () => {
    try {
      tasks = JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch {
      tasks = [];
    }
  };

  // AI helpers
  function aiGuessPriority(title) {
    const t = title.toLowerCase();
    if (t.includes('urgent') || t.includes('asap') || t.includes('important') || t.includes('due')) return 'high';
    if (t.includes('review') || t.includes('prepare') || t.includes('check') || t.includes('meeting')) return 'medium';
    return 'low';
  }
  function aiGuessDate(title) {
    const t = title.toLowerCase();
    const now = new Date();
    if (t.includes('today')) return now.toISOString().slice(0, 16);
    if (t.includes('tomorrow')) { now.setDate(now.getDate() + 1); return now.toISOString().slice(0, 16); }
    if (t.includes('next week')) { now.setDate(now.getDate() + 7); return now.toISOString().slice(0, 16); }
    const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let h = Number(timeMatch[1]);
      const m = Number(timeMatch[2] || 0);
      const ampm = (timeMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      now.setHours(h, m, 0, 0);
      if (now.getTime() < Date.now()) now.setDate(now.getDate() + 1);
      return now.toISOString().slice(0, 16);
    }
    return '';
  }

  // Stats
  function renderStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const overdue = tasks.filter(t => t.datetime && !t.completed && new Date(t.datetime) < new Date()).length;
    const percent = Math.round((completed / (total || 1)) * 100);
    statsBar.textContent = `Total: ${total} • Completed: ${completed} (${percent}%) • Overdue: ${overdue}`;
  }

  // Render
  function render() {
    const q = searchInput.value.trim().toLowerCase();
    let list = tasks.slice();

    if (filter === 'active') list = list.filter(t => !t.completed);
    if (filter === 'completed') list = list.filter(t => t.completed);
    if (filter === 'high') list = list.filter(t => t.priority === 'high');
    if (q) list = list.filter(t => t.title.toLowerCase().includes(q));

    if (sortSelect.value === 'priority') {
      const order = { high: 1, medium: 2, low: 3 };
      list.sort((a, b) => (order[a.priority] || 99) - (order[b.priority] || 99));
    } else if (sortSelect.value === 'due') {
      list.sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));
    } else {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    taskList.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'task';
      empty.innerHTML = `<div class="content"><p class="title" style="opacity:.7">No tasks found</p></div>`;
      taskList.appendChild(empty);
    }

    list.forEach((t) => {
      const li = document.createElement('li');
      li.className = `task${t.completed ? ' completed' : ''}`;
      li.dataset.id = t.id;
      li.innerHTML = `
        <div class="checkbox" role="button" aria-pressed="${t.completed}" tabindex="0" title="${t.completed ? 'Mark as active' : 'Mark as completed'}">
          ${t.completed ? '✓' : ''}
        </div>
        <div class="content">
          <p class="title">${escapeHtml(t.title)}</p>
          <div class="meta">
            ${t.datetime ? `<span class="time">${escapeHtml(formatDateTime(t.datetime))}</span>` : ''}
            <span class="pill ${getPriorityClass(t.priority)}">${t.priority}</span>
          </div>
        </div>
        <div class="actions">
          <button class="icon-btn edit" title="Edit" aria-label="Edit task">✎</button>
          <button class="icon-btn delete" title="Delete" aria-label="Delete task">🗑</button>
        </div>
      `;
      li.querySelector('.content').addEventListener('dblclick', () => openEdit(t.id));
      taskList.appendChild(li);
    });

    countEl.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
    renderStats();
    save();
  }

  // CRUD
  function addTask(title, priority, datetime) {
    tasks.unshift({
      id: uid(),
      title: title.trim(),
      priority: priority || 'medium',
      datetime: datetime || '',
      completed: false,
      createdAt: new Date().toISOString()
    });
    render();
  }
  function toggleComplete(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    render();
  }
  function removeTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    render();
  }
  function clearCompleted() {
    tasks = tasks.filter(t => !t.completed);
    render();
  }
  function openEdit(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    editInput.value = t.title;
    editPriority.value = t.priority;
    editDatetime.value = t.datetime;
    editModal.setAttribute('aria-hidden', 'false');
  }
  function closeEdit() {
    editingId = null;
    editForm.reset();
    editModal.setAttribute('aria-hidden', 'true');
  }
  function setFilter(f) {
    filter = f;
    filters.forEach(b => b.classList.remove('active'));
    const btn = filters.find(b => b.dataset.filter === f);
    if (btn) btn.classList.add('active');
    render();
  }

  // Events
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    addTask(title, priorityInput.value || aiGuessPriority(title), datetimeInput.value || aiGuessDate(title));
    form.reset();
    priorityInput.value = 'medium';
    titleInput.focus();
  });

  taskList.addEventListener('click', (e) => {
    const li = e.target.closest('.task');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.closest('.delete')) return removeTask(id);
    if (e.target.closest('.edit')) return openEdit(id);
    if (e.target.closest('.checkbox')) return toggleComplete(id);
  });

  clearCompletedBtn.addEventListener('click', clearCompleted);
  searchInput.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
  filters.forEach(btn => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = tasks.find(x => x.id === editingId);
    if (t) {
      t.title = editInput.value.trim() || t.title;
      t.priority = editPriority.value;
      t.datetime = editDatetime.value;
    }
    render();
    closeEdit();
  });
  cancelEdit.addEventListener('click', closeEdit);
  editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEdit(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEdit(); });

  // AI summary
  aiSummaryBtn.addEventListener('click', () => {
    const active = tasks.filter(t => !t.completed);
    if (!active.length) return alert('No active tasks.');
    const high = active.filter(t => t.priority === 'high').length;
    const medium = active.filter(t => t.priority === 'medium').length;
    const low = active.filter(t => t.priority === 'low').length;
    alert(`You have ${active.length} active tasks. ${high} high, ${medium} medium, ${low} low priority.`);
  });

  // Init
  load();
  render();
})();
