// Tells IndexNow (Bing, Yandex and others) which pages changed in a deploy.
// The key is public by design: search engines check it against /<key>.txt
// on the site, so it is not a secret.
//
// The build writes /indexnow-manifest.json with a hash of every sitemap
// page's content (see lib/content-dates.mjs), and after the deploy this
// submits the URLs whose hash changed since the previous manifest, plus new
// and removed ones. Check times and relative ages are left out of the hash,
// so a rebuild that only moves the clock submits nothing.
//
// After the deploy: node scripts/indexnow.mjs ping <previous manifest> dist
// A missing previous manifest (first run) submits every URL once. A failed
// ping is logged and never fails the deploy.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE } from '../lib/site.mjs';
import { MANIFEST, contentHash, manifestEntry } from '../lib/content-dates.mjs';

export { MANIFEST, contentHash };

export const INDEXNOW_KEY = '5395aa81dde2ff2e16e0802d894731cd';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// New and changed URLs in sitemap order, then removed ones.
export function changedUrls(previous, next) {
  const before = (previous?.version === 1 || previous?.version === 2) && previous.pages ? previous : null;
  const now = Object.keys(next.pages);
  if (!before) return now;
  const changed = now.filter((loc) => manifestEntry(before, loc)?.hash !== manifestEntry(next, loc).hash);
  const removed = Object.keys(before.pages).filter((loc) => !(loc in next.pages));
  return [...changed, ...removed];
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
  const [command, ...args] = process.argv.slice(2);
  if (command === 'ping') {
    const [previousPath, dist = 'dist'] = args;
    const previous = previousPath ? await readFile(previousPath, 'utf8').then(JSON.parse).catch(() => null) : null;
    const next = JSON.parse(await readFile(path.join(dist, MANIFEST), 'utf8'));
    const urls = changedUrls(previous, next);
    console.log(previous ? `${urls.length} of ${Object.keys(next.pages).length} URLs changed since the last deploy` : 'no previous manifest, submitting every URL once');
    console.log(await pingIndexNow(urls));
  } else {
    console.error('usage: indexnow.mjs ping <previous manifest> <dist>');
    process.exit(2);
  }
}
