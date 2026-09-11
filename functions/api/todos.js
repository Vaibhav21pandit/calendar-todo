import { ensureSchema } from '../_utils.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function bad(msg, status = 400) { return json({ error: msg }, status); }

function normalizeTodo(body) {
  const now = Date.now();
  const {
    id, title, date, time, duration, priority, desc, completed,
    createdAt, updatedAt, deletedAt, deviceId, allDay
  } = body || {};
  if (!id || typeof id !== 'string') return { error: 'id required' };
  if (!title || !String(title).trim()) return { error: 'title required' };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date required YYYY-MM-DD' };
  const isAllDay = !!allDay;
  let normTime = time;
  let normDur = Number(duration);
  if (isAllDay) {
    normTime = '00:00';
    normDur = 1440;
  } else {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return { error: 'time required HH:MM' };
    if (!Number.isFinite(normDur) || normDur <= 0) return { error: 'duration required' };
  }
  if (!['super','kinda','chill','blocked','wontdo'].includes(priority)) return { error: 'priority must be super|kinda|chill|blocked|wontdo' };
  return {
    todo: {
      id: String(id),
      title: String(title).trim(),
      date: String(date),
      time: String(normTime),
      duration: normDur,
      priority: String(priority),
      desc: String(desc||'').trim(),
      completed: completed ? 1 : 0,
      createdAt: Number.isFinite(Number(createdAt)) ? Number(createdAt) : now,
      updatedAt: Number.isFinite(Number(updatedAt)) ? Number(updatedAt) : now,
      deletedAt: deletedAt ? Number(deletedAt) : null,
      deviceId: deviceId ? String(deviceId) : null,
      allDay: isAllDay ? 1 : 0,
    }
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'DB not bound (set database_id in wrangler.toml or create D1)' }, 503);
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  let sql = 'SELECT * FROM todos WHERE deletedAt IS NULL';
  const params = [];
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date ASC, time ASC';
  try {
    const stmt = env.DB.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const { results } = await bound.all();
    // map 0/1 -> bool for completed/allDay
    const mapped = (results || []).map(r => ({ ...r, completed: !!r.completed, allDay: !!r.allDay }));
    return json(mapped);
  } catch (e) {
    return bad('DB error: ' + e.message, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  await ensureSchema(env.DB);
  let body;
  try { body = await request.json(); } catch { return bad('invalid JSON'); }
  const { todo, error } = normalizeTodo(body);
  if (error) return bad(error);

  try {
    // LWW: only upsert if incoming updatedAt >= existing
    const existing = await env.DB.prepare('SELECT updatedAt FROM todos WHERE id = ?').bind(todo.id).first();
    if (existing && todo.updatedAt < existing.updatedAt) {
      // stale write — return existing as canonical (online-first conflict resolution: server wins newer)
      const cur = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(todo.id).first();
      return json({ ...cur, completed: !!cur.completed, allDay: !!cur.allDay, conflict: 'stale_ignored' });
    }

    await env.DB.prepare(`
      INSERT INTO todos (id, title, date, time, duration, priority, desc, completed, createdAt, updatedAt, deletedAt, deviceId, allDay)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        date=excluded.date,
        time=excluded.time,
        duration=excluded.duration,
        priority=excluded.priority,
        desc=excluded.desc,
        completed=excluded.completed,
        updatedAt=excluded.updatedAt,
        deletedAt=excluded.deletedAt,
        deviceId=excluded.deviceId,
        allDay=excluded.allDay
    `).bind(
      todo.id, todo.title, todo.date, todo.time, todo.duration, todo.priority, todo.desc, todo.completed, todo.createdAt, todo.updatedAt, todo.deletedAt, todo.deviceId, todo.allDay
    ).run();

    const saved = await env.DB.prepare('SELECT * FROM todos WHERE id = ?').bind(todo.id).first();
    return json({ ...saved, completed: !!saved.completed, allDay: !!saved.allDay }, 201);
  } catch (e) {
    return bad('DB error: ' + e.message, 500);
  }
}
