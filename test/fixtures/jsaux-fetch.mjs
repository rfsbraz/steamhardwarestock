// Preloaded with --import in build tests. Replaces fetch so the build reads the
// recorded JSAUX feed instead of the network. JSAUX_STUB=fail blocks it.
import { readFileSync } from 'node:fs';

const feed = readFileSync(new URL('./jsaux-products.json', import.meta.url), 'utf8');
// Smallest valid WebP: 1x1 lossless.
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (process.env.JSAUX_STUB === 'fail') throw new TypeError('fetch failed');
  if (url.hostname === 'jsaux.com' && url.pathname === '/collections/all/products.json') {
    const page = Number(url.searchParams.get('page') || 1);
    return new Response(page === 1 ? feed : '{"products":[]}', { headers: { 'content-type': 'application/json' } });
  }
  if (url.hostname === 'cdn.shopify.com') {
    return new Response(WEBP, { headers: { 'content-type': 'image/webp' } });
  }
  throw new TypeError(`unexpected fetch in test: ${url}`);
};
