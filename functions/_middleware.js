export async function onRequest({ request, next }) {
  // CORS for API
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }
    const res = await next();
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  }
  return next();
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
