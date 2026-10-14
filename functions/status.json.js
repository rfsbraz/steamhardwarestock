import { serveKey } from './_kv.js';

const CACHE = 'public, max-age=30, s-maxage=60, stale-while-revalidate=600';

// The cron stores the document without generatedAt (status-body, rewritten
// only on change) and the check time on its own (status-meta, every run).
// They are joined as text so this function never parses the large body.
export async function onRequestGet({ env }) {
  const kv = env.STOCK_KV;
  if (kv) {
    const [body, meta] = await Promise.all([kv.get('status-body'), kv.get('status-meta')]);
    if (body && meta && body.startsWith('{')) {
      let generatedAt = null;
      try {
        generatedAt = JSON.parse(meta).generatedAt;
      } catch {}
      if (generatedAt) {
        const rest = body.length > 2 ? `,${body.slice(1)}` : '}';
        return new Response(`{"generatedAt":${JSON.stringify(generatedAt)}${rest}`, {
          status: 200,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': CACHE }
        });
      }
    }
  }
  // Before the first run of the split format, serve the old single key.
  return serveKey(env, 'status.json', { cache: CACHE });
}
