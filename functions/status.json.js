import { serveKey } from './_kv.js';

export function onRequestGet({ env }) {
  return serveKey(env, 'status.json', { cache: 'public, max-age=30, s-maxage=60, stale-while-revalidate=600' });
}
