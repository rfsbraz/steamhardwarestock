// Komodo Station proxy on Cloudflare Pages. The rules live in lib/komodo-proxy.mjs.
import handler from '../lib/komodo-proxy.mjs';

export function onRequest({ request }) {
  return handler(request);
}
