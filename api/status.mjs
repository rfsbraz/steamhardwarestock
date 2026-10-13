import { readStatusText } from '../lib/history-store.mjs';

// Served as /status.json. The CDN caches it for a minute, so open tabs cost
// about one function call per minute per edge region, not one per tab.
const CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=600';
const HEADERS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: HEADERS });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response(JSON.stringify({ error: 'no storage configured' }), { status: 503, headers: { ...HEADERS, 'cache-control': 'no-store' } });
    }
    try {
      const text = await readStatusText();
      if (!text) {
        return new Response(JSON.stringify({ error: 'no status yet' }), { status: 503, headers: { ...HEADERS, 'cache-control': 'no-store' } });
      }
      return new Response(request.method === 'HEAD' ? null : text, { status: 200, headers: { ...HEADERS, 'cache-control': CACHE } });
    } catch (error) {
      console.error('status read error:', error?.name, error?.message);
      return new Response(JSON.stringify({ error: 'status unavailable' }), { status: 503, headers: { ...HEADERS, 'cache-control': 'no-store' } });
    }
  }
};
