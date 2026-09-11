import { ensureSchema } from '../_utils.js';

export async function onRequestGet({ env }) {
  // Check DB connectivity if bound
  let dbOk = false;
  try {
    if (env.DB) {
      await ensureSchema(env.DB);
      await env.DB.prepare('SELECT 1').first();
      dbOk = true;
    }
  } catch {}
  return Response.json({ ok: true, db: dbOk, ts: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
