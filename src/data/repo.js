import { idbGetAllTodos, idbPutTodo, idbPutTodos, idbDeleteTodo, idbEnqueueOutbox, idbGetOutbox, idbClearOutbox } from './idb.js';
import { apiListTodos, apiCreateTodo, apiUpdateTodo, apiDeleteTodo } from './api.js';
import { getDeviceId } from '../lib/device.js';

export let SYNC_ENABLED = true; // online-first: server is truth, fallback to cache
export function setSyncEnabled(v) { SYNC_ENABLED = v; }

function isOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

// Online-first: try network, fallback to cache; writes go network-first.
export async function repoList({ from, to } = {}) {
  if (!isOnline()) {
    return idbGetAllTodos();
  }
  if (SYNC_ENABLED) {
    try {
      const remote = await apiListTodos({ from, to });
      // cache remote
      if (Array.isArray(remote)) await idbPutTodos(remote);
      return remote;
    } catch {
      return idbGetAllTodos();
    }
  }
  // before sync enabled, just use cache (which mirrors localStorage via migrate)
  return idbGetAllTodos();
}

export async function repoSave(todo) {
  const normalized = { ...todo, updatedAt: Date.now(), deviceId: todo.deviceId || getDeviceId() };
  // always update local cache optimistically
  await idbPutTodo(normalized);

  if (!SYNC_ENABLED) return normalized;
  if (!isOnline()) {
    await idbEnqueueOutbox({ op: 'upsert', todo: normalized });
    return normalized;
  }
  try {
    // try upsert via API: POST for create, PATCH for update — we use POST upsert for simplicity
    const exists = false; // let server decide; POST with id upserts
    await apiCreateTodo(normalized);
    return normalized;
  } catch {
    await idbEnqueueOutbox({ op: 'upsert', todo: normalized });
    return normalized;
  }
}

export async function repoDelete(id) {
  await idbDeleteTodo(id);
  if (!SYNC_ENABLED) return;
  if (!isOnline()) {
    await idbEnqueueOutbox({ op: 'delete', id });
    return;
  }
  try {
    await apiDeleteTodo(id);
  } catch {
    await idbEnqueueOutbox({ op: 'delete', id });
  }
}

export async function repoToggle(id, completed) {
  const all = await idbGetAllTodos();
  const found = all.find(t => t.id === id);
  if (!found) return null;
  const patched = { ...found, completed, updatedAt: Date.now() };
  return repoSave(patched);
}

export async function flushOutbox() {
  if (!SYNC_ENABLED) return { flushed: 0 };
  const outbox = await idbGetOutbox();
  if (outbox.length === 0) return { flushed: 0 };
  let flushedIds = [];
  for (const entry of outbox) {
    try {
      if (entry.op === 'upsert') await apiCreateTodo(entry.todo);
      else if (entry.op === 'delete') await apiDeleteTodo(entry.id);
      flushedIds.push(entry.id);
    } catch {
      break; // stop on first failure (still offline)
    }
  }
  if (flushedIds.length) await idbClearOutbox(flushedIds);
  return { flushed: flushedIds.length, remaining: outbox.length - flushedIds.length };
}

// expose for testing
export function __setSyncEnabled(v) {
  // not actually mutable due to const; tests can mock api instead
}
