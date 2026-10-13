// Komodo Station proxy on Cloudflare Pages, same rules as the Vercel function.
import handler from '../api/proxy.mjs';

export function onRequest({ request }) {
  return handler(request);
}
