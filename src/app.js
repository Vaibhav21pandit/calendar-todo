import {
  getMonday, addDays, formatMonthYear, formatDateISO, parseISO,
  isSameDay, isToday, getWeekDays, timeToMinutes, minutesToTime,
  formatHour, formatTime12, labelForPrio, escapeHtml, uid, layoutDayTodos,
  getHeaderLabel, getMiniCalendarCells
} from './utils.js';
import { setupPWA, setupInstallPrompt } from './pwa.js';
import { idbGetAllTodos, idbPutTodo, idbPutTodos, idbDeleteTodo } from './data/idb.js';
import { migrateLocalStorageToIdb } from './data/migrate.js';
import { repoList, repoSave, repoDelete, flushOutbox } from './data/repo.js';
import { getDeviceId } from './lib/device.js';

if (typeof window !== 'undefined' && !import.meta.env?.TEST) {
  setupPWA();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupInstallPrompt);
  else setupInstallPrompt();
}

const HOUR_H = 52;

// State
let todos = [];
let weekStart = getMonday(new Date()); // kept for weekly progress calc + mini calendar
let miniDate = new Date(weekStart);
let filterState = { super: true, kinda: true, chill: true, blocked: true, wontdo: true };
let editingId = null;
let syncState = 'idle';

// View mode: 'week' | '3day' | 'day' — default 3-day on mobile, week on desktop
let viewMode = (() => {
  try {
    const saved = localStorage.getItem('calViewMode');
    if (saved && ['day','3day','week'].includes(saved)) return saved;
  } catch {}
  return window.innerWidth < 768 ? '3day' : 'week';
})();
let viewAnchor = (() => {
  const d = new Date(); d.setHours(0,0,0,0);
  if (viewMode === 'week') return getMonday(d);
  return d; // for day/3day start at today
})();
function viewSize() { return viewMode === 'week' ? 7 : viewMode === '3day' ? 3 : 1; }
function getVisibleDays() {
  if (viewMode === 'week') return getWeekDays(viewAnchor);
  return Array.from({ length: viewSize() }, (_, i) => addDays(viewAnchor, i));
}
function getHeaderLabelForView() {
  const days = getVisibleDays();
  if (days.length === 1) {
    return days[0].toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (days.length === 3) {
    const a = days[0], b = days[2];
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
      return `${a.toLocaleDateString('en-US',{month:'long'})} ${a.getDate()}–${b.getDate()}, ${a.getFullYear()}`;
    return `${a.toLocaleDateString('en-US',{month:'short', day:'numeric'})} – ${b.toLocaleDateString('en-US',{month:'short', day:'numeric', year:'numeric'})}`;
  }
  return getHeaderLabel(viewAnchor);
}

// DOM refs
const currentMonthEl = document.getElementById('currentMonth');
const weekHeaderEl = document.getElementById('weekHeader');
const timeGridEl = document.getElementById('timeGrid');
const gridScrollEl = document.getElementById('gridScroll');
const miniGridEl = document.getElementById('miniGrid');
const miniMonthEl = document.getElementById('miniMonth');
const sidebarTodoListEl = document.getElementById('sidebarTodoList');
const toastEl = document.getElementById('toast');
const dialog = document.getElementById('todoDialog');
const form = document.getElementById('todoForm');
const allDayCellsEl = document.getElementById('allDayCells');
const offlineBanner = document.getElementById('offlineBanner');
const syncStatus = document.getElementById('syncStatus');
const todoAllDayEl = document.getElementById('todoAllDay');
const todoTimeEl = document.getElementById('todoTime');
const todoDurationEl = document.getElementById('todoDuration');
const viewSwitcherEl = document.getElementById('viewSwitcher');

function updateViewSwitcher() {
  if (!viewSwitcherEl) return;
  viewSwitcherEl.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewMode);
  });
  // also update CSS var for grid cols fallback
  document.documentElement.style.setProperty('--cols', String(viewSize()));
}

function setViewMode(mode, opts = {}) {
  if (!['day','3day','week'].includes(mode)) return;
  const prevMode = viewMode;
  viewMode = mode;
  try { localStorage.setItem('calViewMode', mode); } catch {}
  // when switching, keep anchor sensible: if switching to week, snap to Monday; if to day/3day, snap to today or keep current anchor's first day
  if (opts.anchor) viewAnchor = new Date(opts.anchor);
  else if (prevMode === 'week' && mode !== 'week') {
    // coming from week: focus on today if today in week, else first day of week
    const today = new Date(); today.setHours(0,0,0,0);
    const weekDays = getWeekDays(viewAnchor);
    const hasToday = weekDays.some(d=>isSameDay(d, today));
    viewAnchor = hasToday ? new Date(today) : new Date(weekDays[0]);
  } else if (prevMode !== 'week' && mode === 'week') {
    viewAnchor = getMonday(viewAnchor);
  }
  // for day/3day, ensure anchor is at 0h
  viewAnchor.setHours(0,0,0,0);
  weekStart = mode === 'week' ? new Date(viewAnchor) : getMonday(viewAnchor);
  miniDate = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth(), 1);
  updateViewSwitcher();
  renderAll();
  // toast hint on mobile first switch
  if (prevMode !== mode && window.innerWidth < 768) {
    const label = mode==='day'?'Day view': mode==='3day'?'3-day view':'Week view';
    showToast(label + (mode!=='week'?' — swipe to navigate':''), null, null);
    setTimeout(hideToast, 1500);
  }
}

// init switcher
updateViewSwitcher();
if (viewSwitcherEl) {
  viewSwitcherEl.querySelectorAll('.view-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> setViewMode(btn.dataset.view));
  });
}

// swipe on gridScroll for mobile 3day/day
(function setupSwipe(){
  let startX = 0, startY = 0, isSwiping = false, startTime = 0;
  const thresholdX = 60, thresholdY = 80, maxTime = 600;
  const el = document.getElementById('gridScroll');
  if (!el) return;
  el.addEventListener('touchstart', (e)=>{
    if (viewMode === 'week' && window.innerWidth >= 768) return; // only swipe in mobile day/3day
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    isSwiping = false;
  }, { passive: true });
  el.addEventListener('touchmove', (e)=>{
    if (!startX) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      isSwiping = true;
    }
  }, { passive: true });
  el.addEventListener('touchend', (e)=>{
    if (!isSwiping) { startX=0; return; }
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startTime;
    if (dt < maxTime && Math.abs(dx) > thresholdX && Math.abs(dx) > Math.abs(dy) + 10) {
      if (dx < 0) { // swipe left → next
        viewAnchor = addDays(viewAnchor, viewSize());
        if (viewMode==='week') weekStart = new Date(viewAnchor);
        renderAll();
      } else { // swipe right → prev
        viewAnchor = addDays(viewAnchor, -viewSize());
        if (viewMode==='week') weekStart = new Date(viewAnchor);
        renderAll();
      }
    }
    startX=0; isSwiping=false;
  });
})();

// Filters
document.querySelectorAll('[data-filter]').forEach(cb => {
  cb.addEventListener('change', (e) => {
    filterState[e.target.dataset.filter] = e.target.checked;
    renderAll();
  });
});

function setSyncStatus(text, show = true) {
  if (!syncStatus) return;
  if (show) {
    syncStatus.textContent = text;
    syncStatus.classList.add('show');
  } else {
    syncStatus.classList.remove('show');
  }
}

function updateOfflineBanner() {
  const online = navigator.onLine !== false;
  if (offlineBanner) {
    if (!online) offlineBanner.classList.add('show');
    else offlineBanner.classList.remove('show');
  }
  if (!online) setSyncStatus('Offline', true);
  else if (syncState === 'syncing') setSyncStatus('Syncing…', true);
  else setSyncStatus('', false);
}

window.addEventListener('online', async () => {
  updateOfflineBanner();
  await syncAndRefresh();
});
window.addEventListener('offline', updateOfflineBanner);

// All-day toggle handling
function updateAllDayUI() {
  const isAllDay = todoAllDayEl?.checked;
  if (!todoTimeEl || !todoDurationEl) return;
  const timeRow = todoTimeEl.closest('.form-row');
  // hide time/duration when all-day
  if (isAllDay) {
    todoTimeEl.disabled = true;
    todoDurationEl.disabled = true;
    if (timeRow) timeRow.style.opacity = '0.4';
  } else {
    todoTimeEl.disabled = false;
    todoDurationEl.disabled = false;
    if (timeRow) timeRow.style.opacity = '1';
  }
}
if (todoAllDayEl) {
  todoAllDayEl.addEventListener('change', updateAllDayUI);
}

// Initial load — online-first
async function init() {
  updateOfflineBanner();
  setSyncStatus('Syncing…', true);
  syncState = 'syncing';

  try { await migrateLocalStorageToIdb(); } catch (e) { console.warn('migrate failed', e); }

  let local = [];
  try { local = await idbGetAllTodos(); } catch {}
  if (local.length === 0) {
    const mon = getMonday(new Date());
    const seed = [
      { id: uid(), title: 'Design review - Q4 roadmap', date: formatDateISO(addDays(mon,0)), time: '10:00', duration: 60, priority: 'super', desc: 'With product team', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
      { id: uid(), title: 'Grocery run', date: formatDateISO(addDays(mon,1)), time: '18:00', duration: 45, priority: 'chill', desc: '', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
      { id: uid(), title: 'Fix calendar drag bug', date: formatDateISO(addDays(mon,2)), time: '14:00', duration: 90, priority: 'kinda', desc: 'Investigate drop handler', completed: true, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
      { id: uid(), title: 'Investor call', date: formatDateISO(addDays(mon,3)), time: '09:30', duration: 60, priority: 'super', desc: 'Prepare deck', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
      { id: uid(), title: 'Gym + run', date: formatDateISO(addDays(mon,4)), time: '07:00', duration: 60, priority: 'chill', desc: '', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
      { id: uid(), title: 'Write blog post', date: formatDateISO(addDays(mon,1)), time: '11:00', duration: 120, priority: 'kinda', desc: 'Draft on calendar UX', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
      { id: uid(), title: 'All-day workshop', date: formatDateISO(addDays(mon,2)), time: '00:00', duration: 1440, priority: 'blocked', desc: 'Blocked: waiting for venue', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: true },
      { id: uid(), title: "Won't do: old meeting", date: formatDateISO(addDays(mon,5)), time: '15:00', duration: 60, priority: 'wontdo', desc: '', completed: false, createdAt: Date.now(), updatedAt: Date.now(), deviceId: getDeviceId(), allDay: false },
    ];
    await idbPutTodos(seed);
    local = seed;
    if (navigator.onLine !== false) {
      for (const t of seed) { try { await repoSave(t); } catch {} }
    }
  }

  try {
    if (navigator.onLine === false) throw new Error('offline');
    const remote = await repoList();
    if (Array.isArray(remote) && remote.length > 0) {
      const byId = new Map();
      local.forEach(t => byId.set(t.id, t));
      remote.forEach(r => {
        const existing = byId.get(r.id);
        if (!existing || (r.updatedAt || 0) >= (existing.updatedAt || 0)) byId.set(r.id, r);
      });
      const merged = Array.from(byId.values()).filter(t => !t.deletedAt);
      await idbPutTodos(merged);
      todos = merged;
    } else if (Array.isArray(remote) && remote.length === 0 && local.length > 0) {
      todos = local.filter(t => !t.deletedAt);
      for (const t of todos) { try { await repoSave(t); } catch {} }
    } else {
      todos = local.filter(t => !t.deletedAt);
    }
  } catch (e) {
    console.warn('remote fetch failed, using cache', e);
    try { todos = (await idbGetAllTodos()).filter(t => !t.deletedAt); } catch { todos = local; }
  }

  // normalize: ensure allDay boolean and priority fallback
  todos.forEach(t => {
    t.allDay = !!t.allDay;
    if (!['super','kinda','chill','blocked','wontdo'].includes(t.priority)) t.priority = 'chill';
    if (t.allDay) { t.time = '00:00'; t.duration = 1440; }
  });

  syncState = 'idle';
  updateOfflineBanner();
  setSyncStatus('', false);
  renderAll();
  try { await flushOutbox(); } catch {}
  window._todos = todos;
}

async function syncAndRefresh() {
  if (syncState === 'syncing') return;
  syncState = 'syncing';
  setSyncStatus('Syncing…', true);
  try {
    const res = await flushOutbox();
    if (res.flushed) showToast(`Synced ${res.flushed} queued changes`);
    const remote = await repoList();
    if (Array.isArray(remote)) {
      const local = await idbGetAllTodos();
      const byId = new Map();
      local.forEach(t => byId.set(t.id, t));
      remote.forEach(r => {
        const ex = byId.get(r.id);
        if (!ex || (r.updatedAt||0) >= (ex.updatedAt||0)) byId.set(r.id, r);
      });
      const merged = Array.from(byId.values()).filter(t=>!t.deletedAt);
      merged.forEach(t=>{ t.allDay=!!t.allDay; if(t.allDay){t.time='00:00'; t.duration=1440;}});
      await idbPutTodos(merged);
      todos = merged;
      window._todos = todos;
      renderAll();
    }
  } catch (e) { console.warn('sync failed', e); }
  syncState = 'idle';
  updateOfflineBanner();
  setTimeout(()=>setSyncStatus('', false), 800);
}

setInterval(() => { if (navigator.onLine !== false) syncAndRefresh(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine !== false) syncAndRefresh();
});

function showToast(msg, actionLabel=null, onAction=null){
  toastEl.textContent = '';
  toastEl.append(document.createTextNode(msg));
  if(actionLabel){
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.style.cssText='background:none;border:none;color:#8ab4f8;font-weight:600;cursor:pointer;margin-left:8px';
    btn.onclick = ()=>{ onAction(); hideToast(); };
    toastEl.append(btn);
  }
  toastEl.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(hideToast, 3000);
}
function hideToast(){ toastEl.classList.remove('show'); }

// Rendering
function renderAll(){
  renderHeader();
  renderMiniCalendar();
  renderTimeGrid();
  renderSidebar();
  renderCounts();
  window._todos = todos;
}

function renderHeader(){
  currentMonthEl.textContent = getHeaderLabelForView();
  miniMonthEl.textContent = formatMonthYear(miniDate);
  const days = getVisibleDays();
  const n = days.length;
  // update grid columns dynamically
  weekHeaderEl.style.gridTemplateColumns = `72px repeat(${n}, 1fr)`;
  const allDayRow = document.getElementById('allDayRow');
  if (allDayRow) allDayRow.style.gridTemplateColumns = `72px 1fr`;
  if (allDayCellsEl) {
    allDayCellsEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  }
  if (timeGridEl) {
    timeGridEl.style.gridTemplateColumns = `72px repeat(${n}, 1fr)`;
  }
  const dowNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  let html = `<div class="gmt-label">GMT+${-new Date().getTimezoneOffset()/60}</div>`;
  days.forEach(d=>{
    const todayClass = isToday(d) ? ' today' : '';
    const isFocused = isSameDay(d, viewAnchor);
    html += `<div class="day-head${todayClass}" data-date="${formatDateISO(d)}" title="Tap to focus 1-day">
      <div class="day-name">${dowNames[d.getDay()]}</div>
      <div class="day-num">${d.getDate()}</div>
    </div>`;
  });
  weekHeaderEl.innerHTML = html;
  // tap day header to focus 1-day
  weekHeaderEl.querySelectorAll('.day-head').forEach(el=>{
    el.style.cursor='pointer';
    el.addEventListener('click', ()=>{
      if (viewMode !== 'day') {
        setViewMode('day', { anchor: parseISO(el.dataset.date) });
      }
    });
  });
  if(allDayCellsEl){
    allDayCellsEl.innerHTML = days.map((d)=> `<div class="allday-cell" data-date="${formatDateISO(d)}"></div>`).join('');
    // render all-day todos
    const visible = todos.filter(t=> filterState[t.priority] && t.allDay);
    days.forEach(day=>{
      const iso = formatDateISO(day);
      const cell = allDayCellsEl.querySelector(`.allday-cell[data-date="${iso}"]`);
      if (!cell) return;
      const dayAllDay = visible.filter(t=>t.date===iso);
      dayAllDay.forEach(todo=>{
        const pill = document.createElement('div');
        pill.className = `allday-pill prio-${todo.priority} ${todo.completed?'completed':''}`;
        pill.dataset.id = todo.id;
        pill.draggable = true;
        pill.innerHTML = `
          <div class="allday-pill-check ${todo.completed?'checked':''}" data-check="${todo.id}">${todo.completed?'✓':''}</div>
          <span class="allday-pill-title">${escapeHtml(todo.title)}</span>
        `;
        pill.addEventListener('click', (e)=>{
          if(e.target.closest('[data-check]')) return;
          openDialog(todo);
        });
        const chk = pill.querySelector('[data-check]');
        chk.addEventListener('click', (e)=>{ e.stopPropagation(); toggleComplete(todo.id); });
        // drag for all-day pill
        pill.addEventListener('dragstart', (e)=> handleDragStart(e, todo, true));
        pill.addEventListener('dragend', handleDragEnd);
        // touch drag for mobile - pointer events fallback
        pill.addEventListener('pointerdown', (e)=> handlePointerDown(e, todo, true));
        cell.appendChild(pill);
      });
      // allow drop on allday cell
      cell.addEventListener('dragover', (e)=>{ e.preventDefault(); cell.classList.add('drop-target'); });
      cell.addEventListener('dragleave', ()=> cell.classList.remove('drop-target'));
      cell.addEventListener('drop', (e)=> handleDrop(e, iso, true));
      cell.addEventListener('click', (e)=>{
        if(e.target.closest('.allday-pill')) return;
        openDialog(null, { date: iso, allDay: true });
      });
    });
  }
}

function renderMiniCalendar(){
  // for mini highlight, keep weekStart but also highlight visible days
  const cells = getMiniCalendarCells(miniDate, weekStart, todos);
  const visible = new Set(getVisibleDays().map(formatDateISO));
  miniGridEl.innerHTML = '';
  cells.forEach(c => {
    const isVisible = visible.has(c.iso);
    const div = document.createElement('div');
    div.className = 'mini-day' + (c.other?' other':'') + (c.today?' today':'') + (c.inWeek?' selected':'') + (isVisible?' selected':'') + (c.hasTodo?' has-todo':'');
    div.textContent = c.dayNum;
    div.title = c.iso;
    div.addEventListener('click', ()=>{
      if (viewMode === 'week') {
        viewAnchor = getMonday(c.date);
        weekStart = new Date(viewAnchor);
      } else {
        viewAnchor = new Date(c.date); viewAnchor.setHours(0,0,0,0);
        weekStart = getMonday(viewAnchor);
      }
      miniDate = new Date(c.date.getFullYear(), c.date.getMonth(), 1);
      renderAll();
    });
    miniGridEl.appendChild(div);
  });
}

function renderCounts(){
  const counts = { super:0, kinda:0, chill:0, blocked:0, wontdo:0 };
  todos.forEach(t=> { if(counts[t.priority]!==undefined) counts[t.priority]++; });
  document.getElementById('countSuper').textContent = counts.super;
  document.getElementById('countKinda').textContent = counts.kinda;
  document.getElementById('countChill').textContent = counts.chill;
  const blockedEl = document.getElementById('countBlocked');
  const wontdoEl = document.getElementById('countWontdo');
  if(blockedEl) blockedEl.textContent = counts.blocked;
  if(wontdoEl) wontdoEl.textContent = counts.wontdo;
  const filtered = todos.filter(t=>filterState[t.priority] && getWeekDays(weekStart).some(d=>formatDateISO(d)===t.date));
  const total = filtered.length;
  const done = filtered.filter(t=>t.completed).length;
  document.getElementById('progressChip').textContent = `${done} / ${total}`;
  document.getElementById('progressFill').style.width = total? `${(done/total)*100}%` : '0%';
}

function renderSidebar(){
  const weekDays = getWeekDays(weekStart).map(formatDateISO);
  const weekTodos = todos
    .filter(t=> weekDays.includes(t.date) && filterState[t.priority])
    .sort((a,b)=>{
      if(a.allDay && !b.allDay) return -1;
      if(!a.allDay && b.allDay) return 1;
      if(a.date!==b.date) return a.date.localeCompare(b.date);
      return timeToMinutes(a.time)-timeToMinutes(b.time);
    });
  if(weekTodos.length===0){
    sidebarTodoListEl.innerHTML = `<div style="font-size:12px;color:var(--gray-500);padding:8px;text-align:center">No todos this week.<br/>Click a slot to add one.</div>`;
    return;
  }
  sidebarTodoListEl.innerHTML = weekTodos.map(t=>{
    const d = parseISO(t.date);
    const dayLabel = d.toLocaleDateString('en-US',{weekday:'short'});
    const timeLabel = t.allDay ? 'All day' : formatTime12(t.time);
    return `<div class="sidebar-todo prio-${t.priority} ${t.completed?'completed':''}" data-id="${t.id}">
      <div class="sidebar-todo-check ${t.completed?'checked':''}" data-check="${t.id}">${t.completed?'✓':''}</div>
      <div class="sidebar-todo-main">
        <div class="sidebar-todo-title">${escapeHtml(t.title)} ${t.allDay?'• All day':''}</div>
        <div class="sidebar-todo-meta">${dayLabel} • ${timeLabel} • ${labelForPrio(t.priority)}</div>
      </div>
    </div>`;
  }).join('');
  sidebarTodoListEl.querySelectorAll('[data-check]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      toggleComplete(el.dataset.check);
    });
  });
  sidebarTodoListEl.querySelectorAll('.sidebar-todo').forEach(el=>{
    el.addEventListener('click', ()=>{
      const todo = todos.find(t=>t.id===el.dataset.id);
      if(todo) openDialog(todo);
    });
  });
}

function renderTimeGrid(){
  const days = getVisibleDays();
  timeGridEl.innerHTML = '';
  timeGridEl.style.setProperty('--hour-h', HOUR_H+'px');
  // ensure cols are correct (also set in renderHeader)
  timeGridEl.style.gridTemplateColumns = `72px repeat(${days.length}, 1fr)`;
  for(let h=0; h<24; h++){
    const lbl = document.createElement('div');
    lbl.className='time-label';
    lbl.style.gridColumn='1';
    lbl.style.gridRow=`${h+1}`;
    lbl.textContent = h===0 ? '' : formatHour(h);
    timeGridEl.appendChild(lbl);
  }
  days.forEach((day, idx)=>{
    const col = document.createElement('div');
    col.className='day-col';
    col.dataset.date = formatDateISO(day);
    col.style.gridColumn = `${idx+2}`;
    col.style.gridRow = '1 / span 24';
    col.style.height = `${24*HOUR_H}px`;
    col.style.position='relative';
    for(let h=0; h<24; h++){
      const line = document.createElement('div');
      line.className='hour-line major';
      line.style.top = `${h*HOUR_H}px`;
      col.appendChild(line);
      if(h>0){
        const minor = document.createElement('div');
        minor.className='hour-line minor';
        minor.style.top = `${h*HOUR_H - HOUR_H/2}px`;
        col.appendChild(minor);
      }
    }
    for(let h=0; h<24; h++){
      for(let half=0; half<2; half++){
        const slot = document.createElement('div');
        slot.className='slot';
        slot.style.top = `${h*HOUR_H + half*(HOUR_H/2)}px`;
        slot.dataset.hour = h;
        slot.dataset.min = half*30;
        slot.addEventListener('click', (e)=>{
          if(e.target.closest('.event')) return;
          openDialog(null, { date: col.dataset.date, time: `${String(h).padStart(2,'0')}:${half===0?'00':'30'}` });
        });
        // drop target for timed events
        slot.addEventListener('dragover', (e)=>{ e.preventDefault(); slot.classList.add('drop-target'); });
        slot.addEventListener('dragleave', ()=> slot.classList.remove('drop-target'));
        slot.addEventListener('drop', (e)=> handleDrop(e, col.dataset.date, false, h, half*30));
        col.appendChild(slot);
      }
    }
    // also allow drop on whole col
    col.addEventListener('dragover', (e)=>{ e.preventDefault(); col.classList.add('col-drop-target'); });
    col.addEventListener('dragleave', (e)=>{ if(!col.contains(e.relatedTarget)) col.classList.remove('col-drop-target'); });
    col.addEventListener('drop', (e)=>{
      // if dropped on slot, slot handler already handled; fallback to compute from Y
      if(e.target.closest('.slot')) return;
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top + gridScrollEl.scrollTop;
      // y relative to col top (col top is 0)
      const totalMin = Math.round((y / HOUR_H) * 60);
      const snapped = Math.round(totalMin / 15) * 15;
      const clamped = Math.max(0, Math.min(24*60 - 15, snapped));
      const hh = String(Math.floor(clamped/60)).padStart(2,'0');
      const mm = String(clamped%60).padStart(2,'0');
      handleDrop(e, col.dataset.date, false, Math.floor(clamped/60), clamped%60, hh+':'+mm);
    });
    if(isToday(day)){
      const now = new Date();
      const mins = now.getHours()*60 + now.getMinutes();
      const top = (mins/60)*HOUR_H;
      const nowEl = document.createElement('div');
      nowEl.className='now-line';
      nowEl.style.top = `${top}px`;
      col.appendChild(nowEl);
    }
    timeGridEl.appendChild(col);
  });

  const visibleTodos = todos.filter(t=> filterState[t.priority] && !t.allDay);
  days.forEach(day=>{
    const iso = formatDateISO(day);
    const dayTodos = visibleTodos.filter(t=>t.date===iso).sort((a,b)=> timeToMinutes(a.time)-timeToMinutes(b.time));
    if(dayTodos.length===0) return;
    const layout = layoutDayTodos(dayTodos);
    const colEl = timeGridEl.querySelector(`.day-col[data-date="${iso}"]`);
    dayTodos.forEach(todo=>{
      const pos = layout.get(todo.id);
      const startMin = timeToMinutes(todo.time);
      const top = (startMin/60)*HOUR_H;
      const height = (todo.duration/60)*HOUR_H - 2;
      const ev = document.createElement('div');
      ev.className = `event prio-${todo.priority} ${todo.completed?'completed':''}`;
      ev.style.top = `${top}px`;
      ev.style.height = `${Math.max(22, height)}px`;
      ev.style.left = `calc(${pos.left}% + 4px)`;
      ev.style.width = `calc(${pos.width}% - 8px)`;
      ev.style.zIndex = todo.completed ? 1 : 2;
      ev.dataset.id = todo.id;
      ev.draggable = true;
      const endTime = minutesToTime(startMin + todo.duration);
      ev.innerHTML = `
        <div class="event-header">
          <div class="event-check ${todo.completed?'checked':''}" data-check="${todo.id}"></div>
          <div class="event-title">${escapeHtml(todo.title)}</div>
          <span class="drag-handle material-symbols-outlined">drag_indicator</span>
        </div>
        ${height>28 ? `<div class="event-time">${formatTime12(todo.time)} – ${formatTime12(endTime)}</div>`:''}
        ${todo.desc && height>44 ? `<div class="event-desc">${escapeHtml(todo.desc)}</div>`:''}
      `;
      ev.addEventListener('click', (e)=>{
        if(e.target.closest('.event-check') || e.target.closest('.drag-handle')) return;
        if(ev.dataset.wasDragged === '1') { ev.dataset.wasDragged='0'; return; }
        openDialog(todo);
      });
      const check = ev.querySelector('.event-check');
      check.addEventListener('click', (e)=>{
        e.stopPropagation();
        toggleComplete(todo.id);
      });
      ev.addEventListener('dragstart', (e)=> handleDragStart(e, todo, false));
      ev.addEventListener('dragend', handleDragEnd);
      ev.addEventListener('pointerdown', (e)=> handlePointerDown(e, todo, false));
      colEl.appendChild(ev);
    });
  });

  if(!renderTimeGrid.scrolled){
    gridScrollEl.scrollTop = 8*HOUR_H;
    renderTimeGrid.scrolled = true;
  }
}

// Drag handling (mouse + touch via pointer)
let dragState = null;
let dragGhost = null;

function handleDragStart(e, todo, isAllDay) {
  dragState = { todo, isAllDay, sourceId: todo.id };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', todo.id);
  // ghost
  const crt = e.target.closest('.event') || e.target.closest('.allday-pill');
  if(crt) {
    e.dataTransfer.setDragImage(crt, 20, 20);
    crt.classList.add('dragging');
  }
  // also set global for pointer fallback
  setTimeout(()=>{ if(crt) crt.style.opacity='0.4'; }, 0);
}

function handleDragEnd(e) {
  const crt = e.target.closest('.event') || e.target.closest('.allday-pill');
  if(crt){ crt.classList.remove('dragging'); crt.style.opacity=''; }
  dragState = null;
  document.querySelectorAll('.drop-target, .col-drop-target, .allday-cell.drop-target').forEach(el=>el.classList.remove('drop-target','col-drop-target'));
  if(dragGhost){ dragGhost.remove(); dragGhost=null; }
}

function handlePointerDown(e, todo, isAllDay) {
  // only for touch/pen where dragstart may not fire reliably
  if(e.pointerType === 'mouse' && e.button !== 0) return;
  // we rely on native drag for mouse; pointer handler for touch
  if(e.pointerType === 'touch' || e.pointerType === 'pen') {
    // initiate pointer drag
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const target = e.target.closest('.event') || e.target.closest('.allday-pill');
    if(!target) return;

    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if(!moved && Math.hypot(dx,dy) < 8) return;
      if(!moved){
        moved = true;
        dragState = { todo, isAllDay, sourceId: todo.id, touch: true };
        target.classList.add('dragging');
        // create ghost
        dragGhost = target.cloneNode(true);
        dragGhost.style.position='fixed';
        dragGhost.style.pointerEvents='none';
        dragGhost.style.opacity='0.85';
        dragGhost.style.zIndex='9999';
        dragGhost.style.width = target.offsetWidth + 'px';
        document.body.appendChild(dragGhost);
      }
      if(dragGhost){
        dragGhost.style.left = (ev.clientX + 12) + 'px';
        dragGhost.style.top = (ev.clientY + 12) + 'px';
      }
      target.dataset.wasDragged='1';
      ev.preventDefault();
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if(!moved){ target.classList.remove('dragging'); return; }
      target.classList.remove('dragging');
      if(dragGhost){ dragGhost.remove(); dragGhost=null; }
      // find drop target via elementFromPoint
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const col = el?.closest('.day-col');
      const alldayCell = el?.closest('.allday-cell');
      if(alldayCell && dragState){
        const date = alldayCell.dataset.date;
        // dropping on allday makes it allDay
        finishMove(todo, { date, allDay: true });
      } else if(col && dragState){
        const rect = col.getBoundingClientRect();
        const y = ev.clientY - rect.top + gridScrollEl.scrollTop;
        // y is relative to col's scroll? col top is at 0 relative to timeGrid, but rect accounts for scroll
        // Simpler: compute from col's offsetTop? Use y + scroll.
        // Approximate: time = y / HOUR_H *60
        // Need to adjust for gridScroll scroll: rect.top is viewport, col is inside scroll
        const colTop = col.getBoundingClientRect().top;
        const relY = ev.clientY - colTop;
        const mins = Math.round((relY / HOUR_H) * 60);
        const snapped = Math.round(mins/15)*15;
        const clamped = Math.max(0, Math.min(24*60-15, snapped));
        const hh = String(Math.floor(clamped/60)).padStart(2,'0');
        const mm = String(clamped%60).padStart(2,'0');
        finishMove(todo, { date: col.dataset.date, time: hh+':'+mm, allDay: false });
      }
      dragState=null;
      document.querySelectorAll('.drop-target, .col-drop-target').forEach(el=>el.classList.remove('drop-target','col-drop-target'));
      setTimeout(()=>{ if(target) target.dataset.wasDragged='0'; }, 100);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
}

async function handleDrop(e, date, toAllDay, h, m, timeStr) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.drop-target, .col-drop-target, .allday-cell.drop-target').forEach(el=>el.classList.remove('drop-target','col-drop-target'));
  if(!dragState) {
    // try from dataTransfer
    const id = e.dataTransfer?.getData('text/plain');
    if(id) {
      const todo = todos.find(t=>t.id===id);
      if(todo) dragState = { todo, isAllDay: todo.allDay };
    }
  }
  if(!dragState) return;
  const { todo } = dragState;
  let newDate = date;
  let newTime = null;
  let newAllDay = toAllDay;
  if(!toAllDay){
    if(timeStr) newTime = timeStr;
    else if(h!==undefined) newTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    else {
      // fallback keep same time
      newTime = todo.time;
    }
  }
  await finishMove(todo, { date: newDate, time: newTime, allDay: newAllDay });
  dragState=null;
}

async function finishMove(todo, { date, time, allDay }) {
  if(!todo) return;
  const updates = {};
  if(date && date !== todo.date) updates.date = date;
  // handle allDay toggle
  if(allDay !== undefined && allDay !== todo.allDay){
    updates.allDay = allDay;
    if(allDay){ updates.time='00:00'; updates.duration=1440; }
    else {
      // converting from allDay to timed: keep date, default 09:00 if no time provided
      updates.time = time || '09:00';
      updates.duration = todo.duration === 1440 ? 60 : (todo.duration || 60);
    }
  } else if(!todo.allDay && time && time !== todo.time){
    updates.time = time;
  } else if(todo.allDay && !allDay && time){
    // allDay -> timed with new time?
    updates.allDay = false;
    updates.time = time;
    updates.duration = 60;
  }
  if(Object.keys(updates).length===0) return;
  Object.assign(todo, updates);
  todo.updatedAt = Date.now();
  todo.deviceId = getDeviceId();
  if(todo.allDay){ todo.time='00:00'; todo.duration=1440; }
  await idbPutTodo(todo);
  try { await repoSave(todo); } catch {}
  renderAll();
  showToast(allDay ? `Moved to ${date} (all-day)` : `Moved to ${date} ${time||todo.time}`);
}

// Dialog handling
function openDialog(todo=null, prefill=null){
  editingId = todo ? todo.id : null;
  document.getElementById('todoId').value = todo ? todo.id : '';
  document.getElementById('todoTitle').value = todo ? todo.title : '';
  document.getElementById('todoDate').value = todo ? todo.date : (prefill?.date || formatDateISO(new Date()));
  const isAllDay = todo ? !!todo.allDay : !!prefill?.allDay;
  if(todoAllDayEl) todoAllDayEl.checked = isAllDay;
  updateAllDayUI();
  document.getElementById('todoTime').value = todo ? todo.time : (prefill?.time || '09:00');
  document.getElementById('todoDuration').value = todo ? String(todo.duration) : '60';
  document.getElementById('todoDesc').value = todo ? (todo.desc||'') : '';
  const prio = todo ? todo.priority : (prefill?.priority || 'super');
  document.querySelectorAll('input[name="priority"]').forEach(r=> r.checked = r.value===prio);
  document.getElementById('deleteBtn').style.display = todo ? 'block' : 'none';
  dialog.showModal();
  setTimeout(()=> document.getElementById('todoTitle').focus(), 50);
}

function closeDialog(){ dialog.close(); editingId=null; }

document.getElementById('createBtn').addEventListener('click', ()=> openDialog());
document.getElementById('fabBtn').addEventListener('click', ()=> openDialog());
document.getElementById('closeDialog').addEventListener('click', closeDialog);
dialog.addEventListener('click', (e)=>{
  const rect = dialog.getBoundingClientRect();
  if(e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom){
    closeDialog();
  }
});
document.getElementById('deleteBtn').addEventListener('click', async ()=>{
  if(!editingId) return;
  const idx = todos.findIndex(t=>t.id===editingId);
  if(idx===-1) return;
  const todo = todos[idx];
  todos.splice(idx,1);
  await idbDeleteTodo(todo.id);
  try { await repoDelete(todo.id); } catch {}
  closeDialog();
  renderAll();
  showToast('Todo deleted', 'Undo', async ()=>{
    todos.push(todo);
    await idbPutTodo(todo);
    try { await repoSave(todo); } catch {}
    renderAll();
  });
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const title = document.getElementById('todoTitle').value.trim();
  if(!title) return;
  const date = document.getElementById('todoDate').value;
  const rawTime = document.getElementById('todoTime').value;
  const duration = parseInt(document.getElementById('todoDuration').value,10);
  const priority = document.querySelector('input[name="priority"]:checked').value;
  const desc = document.getElementById('todoDesc').value.trim();
  const allDay = !!todoAllDayEl?.checked;
  const time = allDay ? '00:00' : rawTime;
  const finalDuration = allDay ? 1440 : duration;
  if(!allDay && !rawTime) { showToast('Time required'); return; }
  const now = Date.now();
  const deviceId = getDeviceId();
  if(editingId){
    const t = todos.find(x=>x.id===editingId);
    if(t){
      Object.assign(t, { title, date, time, duration: finalDuration, priority, desc, allDay, updatedAt: now, deviceId });
      await idbPutTodo(t);
      try { await repoSave(t); } catch {}
    }
    showToast('Todo updated');
  } else {
    const todo = { id: uid(), title, date, time, duration: finalDuration, priority, desc, completed:false, createdAt: now, updatedAt: now, deviceId, allDay };
    todos.push(todo);
    await idbPutTodo(todo);
    try { await repoSave(todo); } catch {}
    showToast('Todo added');
  }
  closeDialog();
  renderAll();
  if (navigator.onLine === false) showToast('Offline — queued for sync');
});

// Navigation — respects viewMode (week=7, 3day=3, day=1)
function navPrev() {
  const n = viewSize();
  viewAnchor = addDays(viewAnchor, -n);
  if (viewMode === 'week') weekStart = new Date(viewAnchor);
  else {
    weekStart = getMonday(viewAnchor);
    miniDate = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth(), 1);
  }
  renderAll();
}
function navNext() {
  const n = viewSize();
  viewAnchor = addDays(viewAnchor, n);
  if (viewMode === 'week') weekStart = new Date(viewAnchor);
  else {
    weekStart = getMonday(viewAnchor);
    miniDate = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth(), 1);
  }
  renderAll();
}
document.getElementById('prevWeek').addEventListener('click', navPrev);
document.getElementById('nextWeek').addEventListener('click', navNext);
document.getElementById('todayBtn').addEventListener('click', ()=>{
  const today = new Date(); today.setHours(0,0,0,0);
  if (viewMode === 'week') {
    viewAnchor = getMonday(today);
    weekStart = new Date(viewAnchor);
  } else {
    viewAnchor = new Date(today);
    weekStart = getMonday(viewAnchor);
  }
  miniDate = new Date();
  renderAll();
  gridScrollEl.scrollTop = 8*HOUR_H;
});
document.getElementById('miniPrev').addEventListener('click', ()=>{
  miniDate = new Date(miniDate.getFullYear(), miniDate.getMonth()-1, 1);
  renderMiniCalendar();
});
document.getElementById('miniNext').addEventListener('click', ()=>{
  miniDate = new Date(miniDate.getFullYear(), miniDate.getMonth()+1, 1);
  renderMiniCalendar();
});
document.getElementById('menuBtn').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// Toggle complete
async function toggleComplete(id){
  const t = todos.find(x=>x.id===id);
  if(!t) return;
  t.completed = !t.completed;
  t.updatedAt = Date.now();
  t.deviceId = getDeviceId();
  await idbPutTodo(t);
  try { await repoSave(t); } catch {}
  renderAll();
  showToast(t.completed ? 'Marked as done' : 'Marked as undone');
}

// Export button
const exportBtn = document.createElement('button');
exportBtn.textContent = 'Export JSON';
exportBtn.className = 'btn-text';
exportBtn.style.cssText = 'font-size:12px;margin:8px;color:var(--gray-500);cursor:pointer;background:none;border:none;';
exportBtn.onclick = async () => {
  const data = await idbGetAllTodos();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `calendar-todos-${formatDateISO(new Date())}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Exported');
};
document.querySelector('.legend')?.after(exportBtn);

// Keyboard: N for new
document.addEventListener('keydown', (e)=>{
  if((e.key==='n' || e.key==='N') && !dialog.open && e.target.tagName!=='INPUT' && e.target.tagName!=='TEXTAREA'){
    openDialog();
  }
  if(e.key==='Escape' && dialog.open) closeDialog();
});

// Auto refresh now line every minute
setInterval(renderTimeGrid, 60000);

// Initial render + online sync
renderAll();
init();

// Expose for debugging
window._todos = todos;
window._syncAndRefresh = syncAndRefresh;

// Export for tests
export { renderAll, renderHeader, renderMiniCalendar, renderTimeGrid, renderSidebar, renderCounts };

