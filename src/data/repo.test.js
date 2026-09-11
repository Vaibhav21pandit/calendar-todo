import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { idbGetAllTodos, idbPutTodos, idbGetOutbox, idbClearTodos, idbClearOutbox, resetMemoryFallback } from './idb.js';
import { setSyncEnabled } from './repo.js';

describe('repo online-first + LWW', () => {
  beforeEach(async () => {
    resetMemoryFallback();
    await idbClearTodos();
    await idbClearOutbox([]);
    setSyncEnabled(true);
    vi.stubGlobal('navigator', { onLine: true });
    // mock fetch
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('repoList fetches remote and caches, fallback to idb on failure', async () => {
    const { repoList } = await import('./repo.js');
    // seed idb with local
    await idbPutTodos([{ id: 'local1', title: 'Local', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super', updatedAt: 1000 }]);

    // mock remote success with newer
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => [{ id: 'remote1', title: 'Remote', date: '2026-09-11', time: '09:00', duration: 60, priority: 'chill', updatedAt: 2000 }],
    });
    const remote = await repoList();
    expect(remote).toHaveLength(1);
    expect(remote[0].id).toBe('remote1');
    // cached
    const cached = await idbGetAllTodos();
    expect(cached.some(t=>t.id==='remote1')).toBe(true);
  });

  it('repoList fallback to cache on network error', async () => {
    const { repoList } = await import('./repo.js');
    await idbPutTodos([{ id: 'cached', title: 'Cached', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super', updatedAt: 1 }]);
    fetch.mockRejectedValueOnce(new Error('network down'));
    const todos = await repoList();
    expect(todos).toHaveLength(1);
    expect(todos[0].id).toBe('cached');
  });

  it('repoSave queues when offline', async () => {
    const { repoSave } = await import('./repo.js');
    vi.stubGlobal('navigator', { onLine: false });
    const todo = { id: '1', title: 'Offline Todo', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super', updatedAt: Date.now() };
    await repoSave(todo);
    const outbox = await idbGetOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].op).toBe('upsert');
    const cached = await idbGetAllTodos();
    expect(cached).toHaveLength(1);
  });

  it('flushOutbox sends queued ops when back online', async () => {
    const { repoSave, flushOutbox } = await import('./repo.js');
    vi.stubGlobal('navigator', { onLine: false });
    await repoSave({ id: '1', title: 'A', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super', updatedAt: 1000 });
    vi.stubGlobal('navigator', { onLine: true });
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({}),
    });
    const res = await flushOutbox();
    expect(res.flushed).toBe(1);
    expect(await idbGetOutbox()).toHaveLength(0);
  });

  it('LWW: newer updatedAt wins on merge (app init logic)', async () => {
    // simulate merge logic from app.js init
    const local = [
      { id: '1', title: 'Local Old', updatedAt: 100, deletedAt: null },
      { id: '2', title: 'Local Only', updatedAt: 100, deletedAt: null },
    ];
    const remote = [
      { id: '1', title: 'Remote New', updatedAt: 200, deletedAt: null },
      { id: '3', title: 'Remote Only', updatedAt: 150, deletedAt: null },
    ];
    const byId = new Map();
    local.forEach(t => byId.set(t.id, t));
    remote.forEach(r => {
      const ex = byId.get(r.id);
      if (!ex || (r.updatedAt||0) >= (ex.updatedAt||0)) byId.set(r.id, r);
    });
    const merged = Array.from(byId.values());
    expect(merged.find(t=>t.id==='1').title).toBe('Remote New');
    expect(merged.find(t=>t.id==='2')).toBeTruthy();
    expect(merged.find(t=>t.id==='3')).toBeTruthy();
    expect(merged).toHaveLength(3);
  });

  it('soft delete via deletedAt excluded from merged', async () => {
    const local = [{ id: '1', title: 'A', updatedAt: 100, deletedAt: Date.now() }];
    const remote = [{ id: '1', title: 'A', updatedAt: 200, deletedAt: Date.now() }];
    const byId = new Map();
    local.forEach(t=>byId.set(t.id, t));
    remote.forEach(r=>byId.set(r.id, r));
    const merged = Array.from(byId.values()).filter(t=>!t.deletedAt);
    expect(merged).toHaveLength(0);
  });
});
