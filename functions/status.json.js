import { cached, jsonResponse, readKey, STATUS_CACHE } from './_kv.js';

// The cron stores the document without generatedAt (status-body, rewritten
// only on change) and the check time on its own (status-meta, every run).
// They are joined as text so this function never parses the large body.
export async function onRequestGet(context) {
  return cached(context, async () => {
    const kv = context.env.STOCK_KV;
    if (kv) {
      const [body, meta] = await Promise.all([kv.get('status-body'), kv.get('status-meta')]);
      if (body && meta && body.startsWith('{')) {
        let generatedAt = null;
        try {
          generatedAt = JSON.parse(meta).generatedAt;
        } catch {}
        if (generatedAt) {
          const rest = body.length > 2 ? `,${body.slice(1)}` : '}';
          return jsonResponse(`{"generatedAt":${JSON.stringify(generatedAt)}${rest}`, { cache: STATUS_CACHE });
        }
      }
    }
    // Before the first run of the split format, serve the old single key.
    return readKey(context.env, 'status.json', { cache: STATUS_CACHE });
  });
}
