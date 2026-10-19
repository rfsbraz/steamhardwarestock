import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';
import { pageFile } from '../scripts/prerender.mjs';
import { INDEXNOW_KEY, contentHash, buildManifest, changedUrls, indexNowPayload, pingIndexNow } from '../scripts/indexnow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = 'https://steamhardwarestock.com';

const page = ({ description = 'Steam Deck in Germany: out of stock.', checked = '2026-10-19T09:00:00.000Z', ago = '3 h ago', asset = 'app.1234abcd.js', body = 'Out of stock' } = {}) => `<!doctype html>
<html><head><title>Steam Deck Stock in Germany</title>
<meta name="description" content="${description}">
<link rel="stylesheet" href="/styles.css"><script src="/${asset}"></script>
<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
<script>window.dataLayer=[];gtag('js', new Date());</script>
</head><body><p>Last check: <time datetime="${checked}">${checked}</time>.</p>
<dd><time datetime="2026-09-20T09:30:00.000Z">Sun, 20 Sep 2026</time> (${ago})</dd>
<p>${body}</p></body></html>`;

test('the IndexNow key file is served from the site root with the key as its body', () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8').trim(), INDEXNOW_KEY);
});

test('the content hash changes with copy, structured data and stock status', () => {
  const base = contentHash(page());
  assert.notEqual(contentHash(page({ description: 'Steam Deck in Germany: out of stock. Get a free restock alert.' })), base);
  assert.notEqual(contentHash(page({ body: 'In stock' })), base);
  assert.notEqual(contentHash(page().replace('BreadcrumbList', 'Product')), base);
});

test('the content hash ignores check times, relative ages and asset file names', () => {
  const base = contentHash(page());
  assert.equal(contentHash(page({ checked: '2026-10-19T09:10:00.000Z', ago: '4 h ago', asset: 'app.9999ffff.js' })), base);
  assert.equal(contentHash(page({ ago: 'just now' })), base);
});

test('new, changed and removed URLs are submitted, unchanged ones are not', () => {
  const before = { version: 1, pages: { [`${S}/`]: 'a', [`${S}/about`]: 'b', [`${S}/steam-deck`]: 'c', [`${S}/old`]: 'd' } };
  const after = { version: 1, pages: { [`${S}/`]: 'a', [`${S}/about`]: 'b', [`${S}/steam-deck`]: 'C', [`${S}/steam-deck-black-friday`]: 'e' } };
  assert.deepEqual(changedUrls(before, after), [`${S}/steam-deck`, `${S}/steam-deck-black-friday`, `${S}/old`]);
  assert.deepEqual(changedUrls(after, after), []);
});

test('with no previous manifest every URL is submitted once', () => {
  const after = { version: 1, pages: { [`${S}/`]: 'a', [`${S}/about`]: 'b' } };
  assert.deepEqual(changedUrls(null, after), [`${S}/`, `${S}/about`]);
  assert.deepEqual(changedUrls({ not: 'a manifest' }, after), [`${S}/`, `${S}/about`]);
});

// Builds the site from a fixture into a temp dir and returns its manifest.
function buildWith(mutate = (f) => f) {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-indexnow-'));
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = Object.fromEntries(VALVE_SELLS.map((cc) => [cc, { status: 'out_of_stock', packages: p.packages.map((pk) => ({ id: pk.id, status: 'out_of_stock' })) }]));
  }
  const fixture = mutate({ status: { version: 1, generatedAt: '2026-10-19T09:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history: {}, prices: {} });
  const fixturePath = `${dist}-fixture.json`;
  writeFileSync(fixturePath, JSON.stringify(fixture));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: dist, PRERENDER_FIXTURE: fixturePath, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '1' },
    stdio: 'pipe'
  });
  return { dist, manifest: buildManifest(dist, readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')) };
}

test('the manifest covers every sitemap URL from the built pages', () => {
  const { dist, manifest } = buildWith();
  const locs = [...readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 200);
  assert.deepEqual(Object.keys(manifest.pages).sort(), [...locs].sort());
  const file = pageFile(dist, '/steam-deck/de');
  assert.equal(manifest.pages[`${S}/steam-deck/de`], contentHash(readFileSync(file, 'utf8')));
});

test('a rebuild with only a new check time submits nothing, a stock change submits that page', () => {
  const first = buildWith().manifest;
  const later = buildWith((f) => ({ ...f, status: { ...f.status, generatedAt: '2026-10-19T09:10:00.000Z' } })).manifest;
  assert.deepEqual(changedUrls(first, later), []);
  const restock = buildWith((f) => {
    f.status.products['steam-deck'].DE = { status: 'in_stock', packages: PRODUCTS.find((p) => p.id === 'steam-deck').packages.map((pk) => ({ id: pk.id, status: 'in_stock' })) };
    return f;
  }).manifest;
  const changed = changedUrls(first, restock);
  assert.ok(changed.includes(`${S}/steam-deck/de`), 'the restocked country page is submitted');
  assert.ok(!changed.includes(`${S}/steam-frame/fr`), 'an unrelated page is not');
  assert.ok(changed.length < 20, `${changed.length} URLs for one restock`);
});

test('the payload names the host, key and key location', () => {
  assert.deepEqual(indexNowPayload([`${S}/steam-deck`]), {
    host: 'steamhardwarestock.com',
    key: INDEXNOW_KEY,
    keyLocation: `${S}/${INDEXNOW_KEY}.txt`,
    urlList: [`${S}/steam-deck`]
  });
});

test('pinging posts JSON once, skips an empty list and never throws', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push([url, init]); return { status: 200 }; };
  assert.equal(await pingIndexNow([], { fetchImpl: ok }), 'nothing to submit');
  assert.equal(calls.length, 0);
  assert.equal(await pingIndexNow([`${S}/about`], { fetchImpl: ok }), 'IndexNow answered 200 for 1 URL');
  assert.equal(calls[0][0], 'https://api.indexnow.org/indexnow');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(calls[0][1].body).urlList, [`${S}/about`]);
  const down = async () => { throw new Error('offline'); };
  assert.equal(await pingIndexNow([`${S}/about`], { fetchImpl: down }), 'IndexNow ping failed: offline');
});
