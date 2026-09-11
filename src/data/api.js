// Online-first API client — talks to Cloudflare Worker /api/*
// In dev (vite), /api is proxied to worker; in prod, same origin.

const API_BASE = import.meta.env.VITE_API_URL || '';

async function req(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${text || res.statusText}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export function apiListTodos({ from, to } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const suffix = qs.toString() ? `?${qs}` : '';
  return req(`/api/todos${suffix}`, { method: 'GET' });
}

export function apiCreateTodo(todo) {
  return req('/api/todos', { method: 'POST', body: JSON.stringify(todo) });
}

export function apiUpdateTodo(id, patch) {
  return req(`/api/todos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function apiDeleteTodo(id) {
  return req(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function apiHealth() {
  return req('/api/health', { method: 'GET' });
}
