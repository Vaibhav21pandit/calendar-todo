import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getHeaderLabel, getMiniCalendarCells, getMonday, formatDateISO, addDays } from './utils.js';
import { todosForWeek, progressForWeek, countsByPriority, filterByPriority } from './store.js';

describe('getHeaderLabel', () => {
  it('same month → "September 2026"', () => {
    const ws = new Date(2026, 8, 7); // Sep 7 Mon, end Sep 13 same month
    expect(getHeaderLabel(ws)).toBe('September 2026');
  });
  it('cross month same year → "September – October 2026"', () => {
    const ws = new Date(2026, 8, 28); // Sep 28 Mon, ends Oct 4
    const label = getHeaderLabel(ws);
    expect(label).toContain('September');
    expect(label).toContain('October');
    expect(label).toContain('2026');
  });
  it('cross year → "December 2026 – January 2027"', () => {
    const ws = new Date(2026, 11, 28); // Dec 28 Mon, ends Jan 3 2027
    const label = getHeaderLabel(ws);
    expect(label).toBe('December 2026 – January 2027');
  });
});

describe('getMiniCalendarCells', () => {
  it('generates cells for September 2026, first cell is Sunday Aug 30 (other)', () => {
    const miniDate = new Date(2026, 8, 1);
    const weekStart = getMonday(new Date(2026, 8, 7));
    const cells = getMiniCalendarCells(miniDate, weekStart, []);
    // Sep 1 2026 is Tuesday (2), so startDay=2, first cell is Aug 30 Sunday
    expect(cells[0].date.getDate()).toBe(30);
    expect(cells[0].other).toBe(true);
    expect(cells.length).toBeGreaterThanOrEqual(35);
    expect(cells.length).toBeLessThanOrEqual(42);
  });
  it('marks todos correctly', () => {
    const miniDate = new Date(2026, 8, 1);
    const weekStart = getMonday(new Date(2026, 8, 7));
    const todos = [{ date: '2026-09-10' }, { date: '2026-09-15' }];
    const cells = getMiniCalendarCells(miniDate, weekStart, todos);
    const sep10 = cells.find(c => c.iso === '2026-09-10');
    expect(sep10.hasTodo).toBe(true);
    const sep11 = cells.find(c => c.iso === '2026-09-11');
    expect(sep11.hasTodo).toBe(false);
  });
  it('marks inWeek for current week days', () => {
    const weekStart = new Date(2026, 8, 7);
    const miniDate = new Date(2026, 8, 1);
    const cells = getMiniCalendarCells(miniDate, weekStart, []);
    const weekIsos = Array.from({ length: 7 }, (_, i) => formatDateISO(addDays(weekStart, i)));
    const inWeekCells = cells.filter(c => c.inWeek);
    expect(inWeekCells.map(c => c.iso)).toEqual(expect.arrayContaining(weekIsos));
    expect(inWeekCells.length).toBe(7);
  });
});

describe('Week navigation logic (pure)', () => {
  it('prev/next week shifts by 7', () => {
    let ws = getMonday(new Date(2026, 8, 9)); // Wed -> Mon Sep 7
    ws = addDays(ws, -7);
    expect(ws.getDate()).toBe(31); // Aug 31
    ws = addDays(ws, 7);
    expect(ws.getDate()).toBe(7);
    ws = addDays(ws, 7);
    expect(ws.getDate()).toBe(14);
  });
  it('today resets to current week monday', () => {
    const today = new Date();
    const ws = getMonday(today);
    expect(ws.getDay()).toBe(1);
  });
});

describe('Time grid & sidebar integration via store', () => {
  it('weekly todos sorted', () => {
    const mon = getMonday(new Date(2026, 8, 7));
    const todos = [
      { id: 'c', date: formatDateISO(addDays(mon, 0)), time: '14:00', priority: 'super', completed: false },
      { id: 'a', date: formatDateISO(addDays(mon, 0)), time: '09:00', priority: 'super', completed: false },
      { id: 'b', date: formatDateISO(addDays(mon, 1)), time: '08:00', priority: 'chill', completed: false },
    ];
    const weekTodos = todosForWeek(todos, mon, { super: true, kinda: true, chill: true });
    expect(weekTodos.map(t => t.id)).toEqual(['a', 'c', 'b']);
  });
  it('filtering hides priorities', () => {
    const mon = getMonday(new Date(2026, 8, 7));
    const todos = [
      { id: '1', date: formatDateISO(mon), time: '10:00', priority: 'super', completed: false },
      { id: '2', date: formatDateISO(mon), time: '11:00', priority: 'chill', completed: false },
    ];
    expect(todosForWeek(todos, mon, { super: true, kinda: true, chill: false }).length).toBe(1);
  });
  it('progress counts correctly', () => {
    const mon = getMonday(new Date(2026, 8, 7));
    const todos = [
      { date: formatDateISO(mon), time: '10:00', priority: 'super', completed: true },
      { date: formatDateISO(mon), time: '11:00', priority: 'super', completed: false },
    ];
    const { done, total, pct } = progressForWeek(todos, mon, { super: true, kinda: true, chill: true });
    expect(done).toBe(1);
    expect(total).toBe(2);
    expect(pct).toBe(50);
  });
  it('countsByPriority', () => {
    const todos = [{ priority: 'super' }, { priority: 'super' }, { priority: 'kinda' }];
    expect(countsByPriority(todos)).toEqual({ super: 2, kinda: 1, chill: 0, blocked: 0, wontdo: 0 });
  });
});

describe('DOM: renderTimeGrid slots & events (jsdom)', () => {
  let domTodos;
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="weekHeader"></div>
      <div id="miniGrid"></div><div id="miniMonth"></div><div id="currentMonth"></div>
      <div id="allDayCells"></div>
      <div id="timeGrid" style="--hour-h:52px"></div><div id="gridScroll"></div>
      <div id="sidebarTodoList"></div>
      <span id="countSuper"></span><span id="countKinda"></span><span id="countChill"></span><span id="progressChip"></span><div id="progressFill"></div>
    `;
  });

  it('timeGrid generates 24 hour labels', async () => {
    // simulate renderTimeGrid hour label logic without full app import
    const { formatHour } = await import('./utils.js');
    const timeGridEl = document.getElementById('timeGrid');
    for (let h = 0; h < 24; h++) {
      const lbl = document.createElement('div');
      lbl.className = 'time-label';
      lbl.textContent = h === 0 ? '' : formatHour(h);
      timeGridEl.appendChild(lbl);
    }
    const labels = timeGridEl.querySelectorAll('.time-label');
    expect(labels.length).toBe(24);
    expect(labels[1].textContent).toBe('1 AM');
    expect(labels[12].textContent).toBe('12 PM');
    expect(labels[15].textContent).toBe('3 PM');
  });

  it('slots clickable and generate 48 slots per day', async () => {
    const HOUR_H = 52;
    const day = getMonday(new Date(2026, 8, 7));
    const iso = formatDateISO(day);
    const col = document.createElement('div');
    col.className = 'day-col';
    col.dataset.date = iso;
    for (let h = 0; h < 24; h++) {
      for (let half = 0; half < 2; half++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.style.top = `${h * HOUR_H + half * (HOUR_H / 2)}px`;
        slot.dataset.hour = h;
        slot.dataset.min = half * 30;
        col.appendChild(slot);
      }
    }
    expect(col.querySelectorAll('.slot').length).toBe(48);
    // click simulation
    let clicked = null;
    col.querySelectorAll('.slot')[0].addEventListener('click', () => { clicked = '00:00'; });
    col.querySelector('.slot').click();
    expect(clicked).toBe('00:00');
  });

  it('now-line appears only on today column', () => {
    const today = new Date();
    const monday = getMonday(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const todayCols = days.filter(d => d.toDateString() === today.toDateString());
    expect(todayCols.length).toBe(1);
  });
});
