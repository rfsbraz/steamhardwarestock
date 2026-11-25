import { serveKey, HISTORY_CACHE } from '../_kv.js';

export function onRequestGet(context) {
  return serveKey(context, 'stock-history.json', { cache: HISTORY_CACHE, fallback: '{}' });
}
