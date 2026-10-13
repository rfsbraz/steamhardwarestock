import { serveKey } from '../_kv.js';

export function onRequestGet({ env }) {
  return serveKey(env, 'stock-history.json', { cache: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600', fallback: '{}' });
}
