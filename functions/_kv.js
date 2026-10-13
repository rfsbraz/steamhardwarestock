export async function serveKey(env, key, { cache, fallback }) {
  const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': cache };
  const text = env.STOCK_KV ? await env.STOCK_KV.get(key) : null;
  if (text) return new Response(text, { status: 200, headers });
  if (fallback !== undefined) return new Response(fallback, { status: 200, headers });
  return new Response('{"error":"not ready"}', { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
}
