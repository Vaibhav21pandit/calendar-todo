import { describe, it, expect, beforeEach } from 'vitest';
import { migrateLocalStorageToIdb } from './migrate.js';
import { idbGetAllTodos, idbClearTodos, resetMemoryFallback } from './idb.js';
import { STORAGE_KEY } from '../store.js';

function mockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    _store: store,
  };
}

describe('migrateLocalStorageToIdb', () => {
  beforeEach(async () => {
    resetMemoryFallback();
    await idbClearTodos();
  });

  it('migrates when idb empty and storage has data', async () => {
    const todos = [{ id: '1', title: 'A', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super', completed: false }];
    const storage = mockStorage({ [STORAGE_KEY]: JSON.stringify(todos) });
    const res = await migrateLocalStorageToIdb(storage);
    expect(res.migrated).toBe(true);
    expect(res.count).toBe(1);
    const all = await idbGetAllTodos();
    expect(all).toHaveLength(1);
    expect(all[0].createdAt).toBeDefined();
  });

  it('skips when idb already has data', async () => {
    const { idbPutTodo } = await import('./idb.js');
    await idbPutTodo({ id: 'existing', title: 'X' });
    const storage = mockStorage({ [STORAGE_KEY]: JSON.stringify([{ id: '1', title: 'A' }]) });
    const res = await migrateLocalStorageToIdb(storage);
    expect(res.migrated).toBe(false);
    expect(res.reason).toMatch(/already/);
    expect(await idbGetAllTodos()).toHaveLength(1);
  });

  it('skips when storage empty', async () => {
    const storage = mockStorage({});
    const res = await migrateLocalStorageToIdb(storage);
    expect(res.migrated).toBe(false);
  });
});
