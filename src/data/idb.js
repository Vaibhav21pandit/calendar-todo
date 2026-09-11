import { openDB } from 'idb';

const DB_NAME = 'calendarTodo';
const DB_VERSION = 1;

export function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('todos')) {
        const store = db.createObjectStore('todos', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
        store.createIndex('by-updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
  });
}

// helpers for Node/jsdom tests where indexedDB may be mocked
let memoryFallback = null;
function useMemoryFallback() {
  if (!memoryFallback) {
    memoryFallback = {
      todos: new Map(),
      outbox: [],
      meta: new Map(),
    };
  }
  return memoryFallback;
}

function hasIndexedDB() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export async function idbGetAllTodos() {
  if (!hasIndexedDB()) {
    return Array.from(useMemoryFallback().todos.values());
  }
  const db = await getDb();
  return db.getAll('todos');
}

export async function idbPutTodo(todo) {
  const normalized = {
    ...todo,
    createdAt: todo.createdAt ?? Date.now(),
    updatedAt: todo.updatedAt ?? Date.now(),
    deviceId: todo.deviceId ?? null,
    deletedAt: todo.deletedAt ?? null,
    allDay: !!todo.allDay,
    // normalize all-day time/duration
    time: todo.allDay ? '00:00' : (todo.time ?? '09:00'),
    duration: todo.allDay ? 1440 : (todo.duration ?? 60),
  };
  if (!hasIndexedDB()) {
    useMemoryFallback().todos.set(normalized.id, normalized);
    return normalized;
  }
  const db = await getDb();
  await db.put('todos', normalized);
  return normalized;
}

export async function idbPutTodos(todos) {
  if (!hasIndexedDB()) {
    const mem = useMemoryFallback();
    todos.forEach(t => mem.todos.set(t.id, { ...t, updatedAt: t.updatedAt ?? Date.now(), createdAt: t.createdAt ?? Date.now(), allDay: !!t.allDay }));
    return;
  }
  const db = await getDb();
  const tx = db.transaction('todos', 'readwrite');
  await Promise.all(todos.map(t => tx.store.put({
    ...t,
    createdAt: t.createdAt ?? Date.now(),
    updatedAt: t.updatedAt ?? Date.now(),
    allDay: !!t.allDay,
  })));
  await tx.done;
}

export async function idbDeleteTodo(id) {
  if (!hasIndexedDB()) {
    useMemoryFallback().todos.delete(id);
    return;
  }
  const db = await getDb();
  await db.delete('todos', id);
}

export async function idbClearTodos() {
  if (!hasIndexedDB()) {
    useMemoryFallback().todos.clear();
    return;
  }
  const db = await getDb();
  await db.clear('todos');
}

export async function idbGetMeta(key) {
  if (!hasIndexedDB()) return useMemoryFallback().meta.get(key);
  const db = await getDb();
  return db.get('meta', key);
}

export async function idbSetMeta(key, val) {
  if (!hasIndexedDB()) { useMemoryFallback().meta.set(key, val); return; }
  const db = await getDb();
  await db.put('meta', val, key);
}

// outbox for offline queue
export async function idbEnqueueOutbox(op) {
  const entry = { ...op, enqueuedAt: Date.now() };
  if (!hasIndexedDB()) {
    const mem = useMemoryFallback();
    const id = mem.outbox.length + 1;
    mem.outbox.push({ ...entry, id });
    return id;
  }
  const db = await getDb();
  return db.add('outbox', entry);
}

export async function idbGetOutbox() {
  if (!hasIndexedDB()) return [...useMemoryFallback().outbox];
  const db = await getDb();
  return db.getAll('outbox');
}

export async function idbClearOutbox(ids) {
  if (!hasIndexedDB()) {
    const mem = useMemoryFallback();
    mem.outbox = mem.outbox.filter(o => !ids.includes(o.id));
    return;
  }
  const db = await getDb();
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
}

export function resetMemoryFallback() {
  memoryFallback = null;
}
