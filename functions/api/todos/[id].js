import { ensureSchema } from '../../_utils.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function bad(msg, status = 400) { return json({ error: msg }, status); }

export async function onRequestGet({ params, env }) {
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  await ensureSchema(env.DB);
  const id = params.id;
  try {
    const row = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
    if (!row) return bad('not found', 404);
    return json({ ...row, completed: !!row.completed, allDay: !!row.allDay });
  } catch (e) { return bad(e.message, 500); }
}

export async function onRequestPatch({ request, params, env }) {
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  await ensureSchema(env.DB);
  const id = params.id;
  let patch;
  try { patch = await request.json(); } catch { return bad('invalid JSON'); }

  try {
    const existing = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
    if (!existing) return bad('not found', 404);

    const now = Date.now();
    const updatedAt = Number.isFinite(Number(patch.updatedAt)) ? Number(patch.updatedAt) : now;
    // LWW: ignore if patch is older
    if (updatedAt < existing.updatedAt) {
      return json({ ...existing, completed: !!existing.completed, allDay: !!existing.allDay, conflict: 'stale_ignored' });
    }

    const next = {
      title: patch.title !== undefined ? String(patch.title).trim() : existing.title,
      date: patch.date !== undefined ? String(patch.date) : existing.date,
      time: patch.time !== undefined ? String(patch.time) : existing.time,
      duration: patch.duration !== undefined ? Number(patch.duration) : existing.duration,
      priority: patch.priority !== undefined ? String(patch.priority) : existing.priority,
      desc: patch.desc !== undefined ? String(patch.desc).trim() : existing.desc,
      completed: patch.completed !== undefined ? (patch.completed ? 1 : 0) : existing.completed,
      updatedAt,
      deletedAt: patch.deletedAt !== undefined ? (patch.deletedAt ? Number(patch.deletedAt) : null) : existing.deletedAt,
      deviceId: patch.deviceId !== undefined ? String(patch.deviceId) : existing.deviceId,
      allDay: patch.allDay !== undefined ? (patch.allDay ? 1 : 0) : (existing.allDay || 0),
    };

    if (!next.title) return bad('title required');
    if (!['super','kinda','chill','blocked','wontdo'].includes(next.priority)) return bad('priority invalid');
    if (next.allDay) { next.time = '00:00'; next.duration = 1440; }
    else if (existing.allDay && !next.allDay) {
      // converting all-day → timed: default to 60m and 09:00 if not provided in patch
      if (patch.duration === undefined) next.duration = 60;
      if (patch.time === undefined) next.time = '09:00';
    }

    await env.DB.prepare(`
      UPDATE todos SET title=?, date=?, time=?, duration=?, priority=?, desc=?, completed=?, updatedAt=?, deletedAt=?, deviceId=?, allDay=?
      WHERE id=?
    `).bind(next.title, next.date, next.time, next.duration, next.priority, next.desc, next.completed, next.updatedAt, next.deletedAt, next.deviceId, next.allDay, id).run();

    const saved = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
    return json({ ...saved, completed: !!saved.completed, allDay: !!saved.allDay });
  } catch (e) { return bad(e.message, 500); }
}

export async function onRequestDelete({ params, env }) {
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  await ensureSchema(env.DB);
  const id = params.id;
  try {
    const existing = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first();
    if (!existing) return json({ ok: true, deleted: false });

    // soft delete for sync (so offline devices can pull deletion)
    const now = Date.now();
    await env.DB.prepare('UPDATE todos SET deletedAt=?, updatedAt=? WHERE id=?').bind(now, now, id).run();
    return json({ ok: true, deleted: true, id, deletedAt: now });
  } catch (e) { return bad(e.message, 500); }
}
