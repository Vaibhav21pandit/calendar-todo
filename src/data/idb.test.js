import { describe, it, expect, beforeEach } from 'vitest';
import { idbGetAllTodos, idbPutTodo, idbPutTodos, idbDeleteTodo, idbClearTodos, idbEnqueueOutbox, idbGetOutbox, idbClearOutbox, resetMemoryFallback } from './idb.js';

describe('idb memory fallback (jsdom)', () => {
  beforeEach(async () => {
    resetMemoryFallback();
    await idbClearTodos();
    await idbClearOutbox([]);
  });

  it('put and get', async () => {
    await idbPutTodo({ id: '1', title: 'A', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super', completed: false });
    const all = await idbGetAllTodos();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('1');
    expect(all[0].createdAt).toBeDefined();
    expect(all[0].updatedAt).toBeDefined();
  });

  it('putTodos batch', async () => {
    await idbPutTodos([
      { id: '1', title: 'A', date: '2026-09-10', time: '10:00', duration: 60, priority: 'super' },
      { id: '2', title: 'B', date: '2026-09-11', time: '09:00', duration: 30, priority: 'chill' },
    ]);
    expect(await idbGetAllTodos()).toHaveLength(2);
  });

  it('delete', async () => {
    await idbPutTodo({ id: '1', title: 'A' });
    await idbPutTodo({ id: '2', title: 'B' });
    await idbDeleteTodo('1');
    const all = await idbGetAllTodos();
    expect(all.map(t=>t.id)).toEqual(['2']);
  });

  it('outbox enqueue / get / clear', async () => {
    const id1 = await idbEnqueueOutbox({ op: 'upsert', todo: { id: '1' } });
    await idbEnqueueOutbox({ op: 'delete', id: '1' });
    let box = await idbGetOutbox();
    expect(box).toHaveLength(2);
    expect(box[0].op).toBe('upsert');
    await idbClearOutbox([id1]);
    box = await idbGetOutbox();
    expect(box).toHaveLength(1);
  });
});
