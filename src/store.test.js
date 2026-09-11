import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTodo, validateTodo, loadTodos, saveTodos, addTodo, updateTodo, deleteTodo,
  toggleComplete, filterByPriority, todosForWeek, countsByPriority, progressForWeek, STORAGE_KEY
} from './store.js';
import { getMonday, addDays, formatDateISO } from './utils.js';

function mockStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    clear: () => { for (const k in store) delete store[k]; },
    _store: store
  };
}

describe('validateTodo', () => {
  it('requires title', () => {
    expect(validateTodo({ title: '', date: '2026-09-10', time: '10:00' })).toBe('Title required');
    expect(validateTodo({ title: '  ', date: '2026-09-10', time: '10:00' })).toBe('Title required');
  });
  it('requires date and time', () => {
    expect(validateTodo({ title: 't', date: '', time: '10:00' })).toBe('Date required');
    expect(validateTodo({ title: 't', date: '2026-09-10', time: '' })).toBe('Time required');
  });
  it('passes valid', () => {
    expect(validateTodo({ title: 'hi', date: '2026-09-10', time: '09:00' })).toBeNull();
  });
});

describe('createTodo', () => {
  it('creates with defaults', () => {
    const t = createTodo({ title: ' Test ', date: '2026-09-10', time: '09:00', duration: 60, priority: 'super', desc: '  hi  ' });
    expect(t.title).toBe('Test');
    expect(t.desc).toBe('hi');
    expect(t.completed).toBe(false);
    expect(t.id).toBeDefined();
  });
});

describe('CRUD', () => {
  it('addTodo appends', () => {
    const todos = [];
    const next = addTodo(todos, { title: 'A', date: '2026-09-10', time: '10:00', duration: 30, priority: 'chill', desc: '' });
    expect(next).toHaveLength(1);
    expect(next[0].title).toBe('A');
    expect(todos).toHaveLength(0); // immutable
  });
  it('addTodo throws on invalid', () => {
    expect(() => addTodo([], { title: '', date: '2026-09-10', time: '10:00' })).toThrow();
  });
  it('updateTodo patches', () => {
    const todos = [{ id: '1', title: 'A', priority: 'chill' }, { id: '2', title: 'B' }];
    const next = updateTodo(todos, '1', { title: 'AA' });
    expect(next.find(t => t.id === '1').title).toBe('AA');
    expect(next.find(t => t.id === '2').title).toBe('B');
  });
  it('deleteTodo removes', () => {
    const todos = [{ id: '1' }, { id: '2' }];
    expect(deleteTodo(todos, '1')).toHaveLength(1);
    expect(deleteTodo(todos, '1')[0].id).toBe('2');
  });
  it('toggleComplete flips', () => {
    const todos = [{ id: '1', completed: false }, { id: '2', completed: true }];
    const a = toggleComplete(todos, '1');
    expect(a.find(t => t.id === '1').completed).toBe(true);
    const b = toggleComplete(a, '1');
    expect(b.find(t => t.id === '1').completed).toBe(false);
  });
});

describe('filterByPriority', () => {
  it('filters by state', () => {
    const todos = [
      { id: '1', priority: 'super' },
      { id: '2', priority: 'kinda' },
      { id: '3', priority: 'chill' },
    ];
    expect(filterByPriority(todos, { super: true, kinda: false, chill: true })).toHaveLength(2);
  });
});

describe('todosForWeek', () => {
  it('returns sorted todos for given week and respects filter', () => {
    const mon = new Date(2026, 8, 7); // Monday Sep 7 2026
    const weekStart = getMonday(mon);
    const todos = [
      { id: '1', date: formatDateISO(addDays(weekStart, 2)), time: '14:00', priority: 'super' },
      { id: '2', date: formatDateISO(addDays(weekStart, 0)), time: '10:00', priority: 'super' },
      { id: '3', date: formatDateISO(addDays(weekStart, 0)), time: '09:00', priority: 'kinda' },
      { id: '4', date: formatDateISO(addDays(weekStart, 8)), time: '09:00', priority: 'super' }, // next week
    ];
    const result = todosForWeek(todos, weekStart, { super: true, kinda: true, chill: true });
    expect(result.map(t => t.id)).toEqual(['3', '2', '1']);
    // filter out kinda
    const filtered = todosForWeek(todos, weekStart, { super: true, kinda: false, chill: true });
    expect(filtered.map(t => t.id)).toEqual(['2', '1']);
  });
});

describe('countsByPriority', () => {
  it('counts', () => {
    const todos = [
      { priority: 'super' }, { priority: 'super' }, { priority: 'chill' }
    ];
    expect(countsByPriority(todos)).toEqual({ super: 2, kinda: 0, chill: 1, blocked: 0, wontdo: 0 });
  });
  it('counts new priorities', () => {
    const todos = [
      { priority: 'blocked' }, { priority: 'wontdo' }, { priority: 'super' }
    ];
    expect(countsByPriority(todos)).toEqual({ super: 1, kinda: 0, chill: 0, blocked: 1, wontdo: 1 });
  });
});

describe('progressForWeek', () => {
  it('computes done/total', () => {
    const mon = getMonday(new Date(2026, 8, 7));
    const todos = [
      { date: formatDateISO(addDays(mon, 0)), time: '10:00', priority: 'super', completed: true },
      { date: formatDateISO(addDays(mon, 1)), time: '10:00', priority: 'super', completed: false },
      { date: formatDateISO(addDays(mon, 8)), time: '10:00', priority: 'super', completed: true },
    ];
    const p = progressForWeek(todos, mon, { super: true, kinda: true, chill: true });
    expect(p.total).toBe(2);
    expect(p.done).toBe(1);
    expect(p.pct).toBe(50);
  });
  it('zero when empty', () => {
    const mon = getMonday(new Date(2026, 8, 7));
    const p = progressForWeek([], mon, { super: true, kinda: true, chill: true });
    expect(p.total).toBe(0);
    expect(p.pct).toBe(0);
  });
});

describe('loadTodos / saveTodos', () => {
  it('creates seed when empty', () => {
    const storage = mockStorage();
    const todos = loadTodos(storage);
    expect(todos.length).toBe(6);
    expect(storage.getItem(STORAGE_KEY)).toBeTruthy();
  });
  it('loads existing without seeding', () => {
    const storage = mockStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'x', title: 'hi' }]));
    const todos = loadTodos(storage);
    expect(todos).toHaveLength(1);
    expect(todos[0].id).toBe('x');
  });
  it('saveTodos persists', () => {
    const storage = mockStorage();
    saveTodos([{ id: '1' }], storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toHaveLength(1);
  });
  it('handles corrupted storage gracefully', () => {
    const storage = { getItem: () => { throw new Error('fail'); }, setItem: () => {} };
    const todos = loadTodos(storage);
    // should seed via catch and try setItem (which is noop) – still returns seed
    expect(todos.length).toBe(6);
  });
});
