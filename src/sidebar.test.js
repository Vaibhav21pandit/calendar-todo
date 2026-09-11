import { describe, it, expect, beforeEach } from 'vitest';
import { getMonday, addDays, formatDateISO, escapeHtml, formatTime12, labelForPrio, parseISO } from './utils.js';
import { todosForWeek, countsByPriority, progressForWeek } from './store.js';

function renderSidebarTodosForTest(todos, weekStart, filterState) {
  const weekTodos = todosForWeek(todos, weekStart, filterState);
  if (weekTodos.length === 0) return '<div class="empty">No todos this week.</div>';
  return weekTodos.map(t => {
    const d = parseISO(t.date);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `<div class="sidebar-todo prio-${t.priority} ${t.completed ? 'completed' : ''}" data-id="${t.id}">
      <div class="sidebar-todo-title">${escapeHtml(t.title)}</div>
      <div class="sidebar-todo-meta">${dayLabel} • ${formatTime12(t.time)} • ${labelForPrio(t.priority)}</div>
    </div>`;
  }).join('');
}

describe('Sidebar: filtering, progress, list rendering', () => {
  const mon = getMonday(new Date(2026, 8, 7));
  const todos = [
    { id: '1', title: 'A <script>', date: formatDateISO(mon), time: '10:00', duration: 60, priority: 'super', desc: '', completed: false },
    { id: '2', title: 'B', date: formatDateISO(addDays(mon, 1)), time: '09:00', duration: 60, priority: 'kinda', desc: '', completed: true },
    { id: '3', title: 'C', date: formatDateISO(addDays(mon, 2)), time: '11:00', duration: 60, priority: 'chill', desc: '', completed: false },
    { id: '4', title: 'Out of week', date: formatDateISO(addDays(mon, 8)), time: '10:00', duration: 60, priority: 'super', desc: '', completed: false },
  ];

  it('renders only week todos respecting filter', () => {
    let html = renderSidebarTodosForTest(todos, mon, { super: true, kinda: true, chill: true });
    expect(html).toContain('A &lt;script&gt;'); // escaped
    expect(html).toContain('B');
    expect(html).toContain('C');
    expect(html).not.toContain('Out of week');

    html = renderSidebarTodosForTest(todos, mon, { super: false, kinda: true, chill: true });
    expect(html).not.toContain('data-id="1"');
    expect(html).toContain('data-id="2"');
  });

  it('shows empty state when no todos', () => {
    const html = renderSidebarTodosForTest([], mon, { super: true, kinda: true, chill: true });
    expect(html).toContain('No todos');
  });

  it('counts by priority correctly', () => {
    expect(countsByPriority(todos)).toEqual({ super: 2, kinda: 1, chill: 1, blocked: 0, wontdo: 0 });
    expect(countsByPriority([])).toEqual({ super: 0, kinda: 0, chill: 0, blocked: 0, wontdo: 0 });
  });

  it('progress bar reflects done/total', () => {
    const p = progressForWeek(todos, mon, { super: true, kinda: true, chill: true });
    expect(p.total).toBe(3);
    expect(p.done).toBe(1);
    expect(p.pct).toBeCloseTo(33.33, 1);

    const p2 = progressForWeek(todos, mon, { super: false, kinda: true, chill: false });
    expect(p2.total).toBe(1);
    expect(p2.done).toBe(1);
    expect(p2.pct).toBe(100);
  });

  it('sidebar todo elements have correct priority class and completed', () => {
    document.body.innerHTML = renderSidebarTodosForTest(todos, mon, { super: true, kinda: true, chill: true });
    const els = document.querySelectorAll('.sidebar-todo');
    expect(els.length).toBe(3);
    expect(els[0].classList.contains('prio-super')).toBe(true);
    expect(els[1].classList.contains('prio-kinda')).toBe(true);
    expect(els[1].classList.contains('completed')).toBe(true);
  });

  it('formatTime12 and labelForPrio in meta', () => {
    const html = renderSidebarTodosForTest(todos, mon, { super: true, kinda: true, chill: true });
    expect(html).toContain('10:00 AM');
    expect(html).toContain('Super Urgent');
    expect(html).toContain('Kinda Urgent');
  });

  it('DOM progressChip and fill width via progress', () => {
    document.body.innerHTML = '<span id="progressChip"></span><div id="progressFill"></div>';
    const chip = document.getElementById('progressChip');
    const fill = document.getElementById('progressFill');
    const { done, total, pct } = progressForWeek(todos, mon, { super: true, kinda: true, chill: true });
    chip.textContent = `${done} / ${total}`;
    fill.style.width = `${pct}%`;
    expect(chip.textContent).toBe('1 / 3');
    expect(fill.style.width).toBe('33.33333333333333%');
  });

  it('legend dots exist', () => {
    document.body.innerHTML = '<div class="legend"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span><span class="dot dot-pink"></span><span class="dot dot-blue"></span></div>';
    expect(document.querySelectorAll('.dot').length).toBe(5);
  });
});
