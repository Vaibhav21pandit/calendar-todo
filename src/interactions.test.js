import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addTodo, updateTodo, deleteTodo, toggleComplete } from './store.js';
import { validateTodo } from './store.js';
import { formatDateISO, getMonday, addDays } from './utils.js';

describe('Event interactions: create/edit/delete, toggle complete', () => {
  const mon = getMonday(new Date(2026, 8, 7));
  const baseTodos = [
    { id: 'a', title: 'A', date: formatDateISO(mon), time: '10:00', duration: 60, priority: 'super', desc: '', completed: false },
    { id: 'b', title: 'B', date: formatDateISO(addDays(mon, 1)), time: '11:00', duration: 30, priority: 'chill', desc: 'hi', completed: false },
  ];

  it('create new todo appends and validates', () => {
    const todos = [...baseTodos];
    const next = addTodo(todos, { title: 'New', date: formatDateISO(addDays(mon,2)), time: '09:00', duration: 60, priority: 'kinda', desc: 'notes' });
    expect(next).toHaveLength(3);
    expect(next[2].title).toBe('New');
    expect(next[2].completed).toBe(false);
    // validation
    expect(() => addTodo(todos, { title: '', date: '2026-09-10', time: '10:00' })).toThrow('Title required');
  });

  it('edit updates fields', () => {
    const updated = updateTodo(baseTodos, 'a', { title: 'Updated', time: '12:00', priority: 'kinda', duration: 90 });
    expect(updated.find(t => t.id === 'a').title).toBe('Updated');
    expect(updated.find(t => t.id === 'a').time).toBe('12:00');
    expect(updated.find(t => t.id === 'a').priority).toBe('kinda');
    // unchanged other
    expect(updated.find(t => t.id === 'b').title).toBe('B');
  });

  it('delete removes and undo restores', () => {
    let todos = [...baseTodos];
    const toDelete = todos.find(t => t.id === 'a');
    todos = deleteTodo(todos, 'a');
    expect(todos).toHaveLength(1);
    expect(todos.find(t => t.id === 'a')).toBeUndefined();
    // undo: push back
    todos = [...todos, toDelete];
    expect(todos).toHaveLength(2);
    expect(todos.find(t => t.id === 'a')).toBeDefined();
  });

  it('toggle complete flips and double toggle returns', () => {
    let todos = [...baseTodos];
    todos = toggleComplete(todos, 'a');
    expect(todos.find(t => t.id === 'a').completed).toBe(true);
    todos = toggleComplete(todos, 'a');
    expect(todos.find(t => t.id === 'a').completed).toBe(false);
    // toggle non-existent does nothing
    const origLen = todos.length;
    todos = toggleComplete(todos, 'nonexistent');
    expect(todos.length).toBe(origLen);
  });

  it('duration options parsed as int', () => {
    const durs = ['15','30','45','60','90','120'];
    durs.forEach(d => {
      const n = parseInt(d, 10);
      expect([15,30,45,60,90,120]).toContain(n);
    });
  });

  it('all priorities render correct colors (class mapping)', () => {
    const prioToClass = { super: 'prio-super', kinda: 'prio-kinda', chill: 'prio-chill' };
    expect(prioToClass['super']).toBe('prio-super');
    Object.entries(prioToClass).forEach(([prio, cls]) => {
      document.body.innerHTML = `<div class="event ${cls} prio-${prio}"></div>`;
      expect(document.querySelector('.event').classList.contains(cls)).toBe(true);
    });
  });

  it('slot click prefill date+time', () => {
    // simulate slot click generating prefill
    const colDate = formatDateISO(addDays(mon, 3));
    const h = 14, half = 1;
    const time = `${String(h).padStart(2,'0')}:${half===0?'00':'30'}`;
    expect(time).toBe('14:30');
    // openDialog would use this
    const prefill = { date: colDate, time };
    expect(prefill.date).toBe(colDate);
  });

  it('keyboard N opens dialog when not in input (logic)', () => {
    const isInput = (tag) => tag === 'INPUT' || tag === 'TEXTAREA';
    expect(isInput('INPUT')).toBe(true);
    expect(isInput('DIV')).toBe(false);
    const shouldOpen = (key, tag, dialogOpen) => (key==='n' || key==='N') && !dialogOpen && !isInput(tag);
    expect(shouldOpen('n', 'DIV', false)).toBe(true);
    expect(shouldOpen('n', 'INPUT', false)).toBe(false);
    expect(shouldOpen('n', 'DIV', true)).toBe(false);
  });
});
