// Tells IndexNow (Bing, Yandex and others) which pages changed in a deploy.
// The key is public by design: search engines check it against /<key>.txt
// on the site, so it is not a secret.
//
// Sitemap lastmod only follows recorded stock events, so it misses copy and
// code changes. Instead each deploy publishes /indexnow-manifest.json with a
// hash of every sitemap page's content, and the next deploy submits the URLs
// whose hash changed, plus new and removed ones. Check times and relative
// ages are left out of the hash, so a rebuild that only moves the clock
// submits nothing.
//
// Before the deploy: node scripts/indexnow.mjs manifest dist
// After the deploy:  node scripts/indexnow.mjs ping <previous manifest> dist
// A missing previous manifest (first run) submits every URL once. A failed
// ping is logged and never fails the deploy.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE } from '../lib/site.mjs';
import { pageFile } from './prerender.mjs';

export const INDEXNOW_KEY = '5395aa81dde2ff2e16e0802d894731cd';
export const MANIFEST = 'indexnow-manifest.json';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

// What a search engine would see as the page's content: everything except
// times, relative ages, dateModified, asset links and non-JSON-LD scripts.
export function contentHash(html) {
  const text = String(html)
    .replace(/<time\b[^>]*>[\s\S]*?<\/time>(\s*\((?:just now|\d+\s*(?:min|h|d)\s*ago|\d+[mhd] ago)\))?/g, '')
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '')
    // Follows the latest stock event, or the check time when there is none.
    .replace(/"dateModified":\s*"[^"]*",?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function buildManifest(dist, sitemapXml) {
  const pages = {};
  for (const m of String(sitemapXml).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    pages[loc] = contentHash(readFileSync(pageFile(dist, new URL(loc).pathname), 'utf8'));
  }
  return { version: 1, pages };
}

// New and changed URLs in sitemap order, then removed ones.
export function changedUrls(previous, next) {
  const before = previous?.version === 1 && previous.pages ? previous.pages : null;
  const now = next.pages;
  if (!before) return Object.keys(now);
  const changed = Object.keys(now).filter((loc) => before[loc] !== now[loc]);
  const removed = Object.keys(before).filter((loc) => !(loc in now));
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
  if (command === 'manifest') {
    const dist = args[0] || 'dist';
    const manifest = buildManifest(dist, await readFile(path.join(dist, 'sitemap.xml'), 'utf8'));
    await writeFile(path.join(dist, MANIFEST), JSON.stringify(manifest));
    console.log(`IndexNow manifest: ${Object.keys(manifest.pages).length} URLs`);
  } else if (command === 'ping') {
    const [previousPath, dist = 'dist'] = args;
    const previous = previousPath ? await readFile(previousPath, 'utf8').then(JSON.parse).catch(() => null) : null;
    const next = JSON.parse(await readFile(path.join(dist, MANIFEST), 'utf8'));
    const urls = changedUrls(previous, next);
    console.log(previous ? `${urls.length} of ${Object.keys(next.pages).length} URLs changed since the last deploy` : 'no previous manifest, submitting every URL once');
    console.log(await pingIndexNow(urls));
  } else {
    console.error('usage: indexnow.mjs manifest <dist> | ping <previous manifest> <dist>');
    process.exit(2);
  }
}
