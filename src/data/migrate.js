import { STORAGE_KEY } from '../store.js';
import { idbGetAllTodos, idbPutTodos } from './idb.js';

export async function migrateLocalStorageToIdb(storage = localStorage) {
  try {
    const existing = await idbGetAllTodos();
    if (existing.length > 0) return { migrated: false, reason: 'idb already has data' };

    let raw = null;
    try { raw = storage.getItem(STORAGE_KEY); } catch {}
    if (!raw) return { migrated: false, reason: 'no localStorage data' };

    const todos = JSON.parse(raw);
    if (!Array.isArray(todos) || todos.length === 0) return { migrated: false, reason: 'empty' };

    const now = Date.now();
    const normalized = todos.map(t => ({
      ...t,
      createdAt: t.createdAt ?? now,
      updatedAt: t.updatedAt ?? now,
      deletedAt: t.deletedAt ?? null,
      deviceId: t.deviceId ?? null,
    }));

    await idbPutTodos(normalized);
    return { migrated: true, count: normalized.length };
  } catch (e) {
    return { migrated: false, reason: e.message };
  }
}
