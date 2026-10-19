// Tells IndexNow (Bing, Yandex and others) which sitemap URLs changed in a
// deploy. The key is public by design: search engines check it against
// /<key>.txt on the site, so it is not a secret.
//
// Usage after a deploy: node scripts/indexnow.mjs <previous sitemap> <new sitemap>
// The previous sitemap is the live one fetched before deploying. If it is
// missing, every URL is submitted. A failed ping is logged and never fails
// the deploy.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SITE } from '../lib/site.mjs';

export const INDEXNOW_KEY = '5395aa81dde2ff2e16e0802d894731cd';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function entries(xml) {
  const out = new Map();
  for (const m of String(xml || '').matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (loc) out.set(loc, m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() || '');
  }
  return out;
}

// URLs that are new in the sitemap or whose lastmod changed.
export function changedUrls(previousXml, nextXml) {
  const before = previousXml ? entries(previousXml) : new Map();
  return [...entries(nextXml)].filter(([loc, lastmod]) => !before.has(loc) || before.get(loc) !== lastmod).map(([loc]) => loc);
}

export function indexNowPayload(urls) {
  return { host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

export async function pingIndexNow(urls, { fetchImpl = (...a) => fetch(...a) } = {}) {
  if (!urls.length) return 'nothing to submit';
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowPayload(urls.slice(0, 10000)))
    });
    return `IndexNow answered ${res.status} for ${urls.length} URL${urls.length === 1 ? '' : 's'}`;
  } catch (error) {
    return `IndexNow ping failed: ${error?.message}`;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [previousPath, nextPath] = process.argv.slice(2);
  const previous = previousPath ? await readFile(previousPath, 'utf8').catch(() => null) : null;
  const next = await readFile(nextPath || 'dist/sitemap.xml', 'utf8');
  console.log(await pingIndexNow(changedUrls(previous, next)));
}
