// Shared by feed.xml.js and rss.xml.js. Reads the KV history once per cache
// period and keeps the XML in the edge cache. Never writes KV.
import { FEED_CACHE } from '../lib/feed.mjs';

export async function serveFeed(context, build, type) {
  const { request, env } = context;
  const cache = context.cache || globalThis.caches?.default;
  const key = new Request(new URL(request.url).origin + new URL(request.url).pathname);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  let history = {};
  try {
    const raw = env.STOCK_KV ? await env.STOCK_KV.get('stock-history.json') : null;
    if (raw) history = JSON.parse(raw);
  } catch {
    history = {};
  }
  const res = new Response(build(history), { status: 200, headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': FEED_CACHE, 'access-control-allow-origin': '*' } });
  if (cache) {
    const put = cache.put(key, res.clone());
    if (context.waitUntil) context.waitUntil(put); else await put;
  }
  return res;
}
