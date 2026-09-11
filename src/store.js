import { getMonday, addDays, formatDateISO, uid } from './utils.js';

export const STORAGE_KEY = 'calendarTodos_v1';

export const PRIORITIES = ['super', 'kinda', 'chill', 'blocked', 'wontdo'];

export function createTodo({ title, date, time, duration, priority, desc, allDay }) {
  return {
    id: uid(),
    title: title.trim(),
    date,
    time: allDay ? '00:00' : time,
    duration: allDay ? 1440 : Number(duration),
    priority,
    desc: (desc || '').trim(),
    completed: false,
    allDay: !!allDay,
  };
}

export function validateTodo({ title, date, time, allDay }) {
  if (!title || !title.trim()) return 'Title required';
  if (!date) return 'Date required';
  if (!allDay && !time) return 'Time required';
  return null;
}

export function loadTodos(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const mon = getMonday(new Date());
  const seed = [
    { id: uid(), title: 'Design review - Q4 roadmap', date: formatDateISO(addDays(mon, 0)), time: '10:00', duration: 60, priority: 'super', desc: 'With product team', completed: false },
    { id: uid(), title: 'Grocery run', date: formatDateISO(addDays(mon, 1)), time: '18:00', duration: 45, priority: 'chill', desc: '', completed: false },
    { id: uid(), title: 'Fix calendar drag bug', date: formatDateISO(addDays(mon, 2)), time: '14:00', duration: 90, priority: 'kinda', desc: 'Investigate drop handler', completed: true },
    { id: uid(), title: 'Investor call', date: formatDateISO(addDays(mon, 3)), time: '09:30', duration: 60, priority: 'super', desc: 'Prepare deck', completed: false },
    { id: uid(), title: 'Gym + run', date: formatDateISO(addDays(mon, 4)), time: '07:00', duration: 60, priority: 'chill', desc: '', completed: false },
    { id: uid(), title: 'Write blog post', date: formatDateISO(addDays(mon, 1)), time: '11:00', duration: 120, priority: 'kinda', desc: 'Draft on calendar UX', completed: false },
  ];
  storage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

export function saveTodos(todos, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

export function addTodo(todos, data) {
  const err = validateTodo(data);
  if (err) throw new Error(err);
  const todo = createTodo(data);
  return [...todos, todo];
}

export function updateTodo(todos, id, patch) {
  return todos.map(t => t.id === id ? { ...t, ...patch } : t);
}

export function deleteTodo(todos, id) {
  return todos.filter(t => t.id !== id);
}

export function toggleComplete(todos, id) {
  return todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
}

export function filterByPriority(todos, filterState) {
  return todos.filter(t => filterState[t.priority]);
}

export function todosForWeek(todos, weekStart, filterState) {
  const weekDays = Array.from({ length: 7 }, (_, i) => formatDateISO(addDays(weekStart, i)));
  return todos
    .filter(t => weekDays.includes(t.date) && filterState[t.priority])
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const [ah, am] = a.time.split(':').map(Number);
      const [bh, bm] = b.time.split(':').map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });
}

export function countsByPriority(todos) {
  const counts = { super: 0, kinda: 0, chill: 0, blocked: 0, wontdo: 0 };
  todos.forEach(t => { if (counts[t.priority] !== undefined) counts[t.priority]++; else counts[t.priority] = 1; });
  return counts;
}

export function progressForWeek(todos, weekStart, filterState) {
  const weekTodos = todosForWeek(todos, weekStart, filterState);
  const total = weekTodos.length;
  const done = weekTodos.filter(t => t.completed).length;
  return { total, done, pct: total ? (done / total) * 100 : 0 };
}
