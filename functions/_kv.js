// Shared by the status and history Functions. Reads KV once per stock-check
// interval at each edge and keeps the response in caches.default. Never
// writes KV. A request with Cache-Control: no-cache (the prerender rebuild)
// skips the cache and reads KV, so a deploy after a change still sees it.
// The TTL matches the Worker cron (*/10 * * * *, INTERVAL_SECONDS = 600).
export const STOCK_CACHE_TTL = 600;
export const STATUS_CACHE = `public, max-age=30, s-maxage=${STOCK_CACHE_TTL}, stale-while-revalidate=600`;
export const HISTORY_CACHE = `public, max-age=60, s-maxage=${STOCK_CACHE_TTL}, stale-while-revalidate=600`;

export function skipCache(request) {
  const cc = request?.headers?.get('cache-control') || '';
  return /\bno-cache\b|\bno-store\b/i.test(cc) || request?.headers?.get('pragma') === 'no-cache';
}

function cacheKey(request) {
  const url = new URL(request.url);
  return new Request(url.origin + url.pathname);
}

export function jsonResponse(text, { cache, status = 200 }) {
  const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': cache };
  return new Response(text, { status, headers });
}

export async function cached(context, build) {
  const cache = context.cache || globalThis.caches?.default;
  const key = context.request ? cacheKey(context.request) : null;
  const bypass = skipCache(context.request);
  if (cache && key && !bypass) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const res = await build();
  const cc = res.headers.get('cache-control') || '';
  if (cache && key && res.ok && !/\bno-store\b/i.test(cc)) {
    const put = cache.put(key, res.clone());
    if (context.waitUntil) context.waitUntil(put); else await put;
  }
  return res;
}

export async function readKey(env, key, { cache, fallback }) {
  const text = env.STOCK_KV ? await env.STOCK_KV.get(key) : null;
  if (text) return jsonResponse(text, { cache });
  if (fallback !== undefined) return jsonResponse(fallback, { cache });
  return jsonResponse('{"error":"not ready"}', { cache: 'no-store', status: 503 });
}

export async function serveKey(context, key, opts) {
  return cached(context, () => readKey(context.env, key, opts));
}
