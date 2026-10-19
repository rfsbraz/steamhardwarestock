import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INDEXNOW_KEY, changedUrls, indexNowPayload, pingIndexNow } from '../scripts/indexnow.mjs';

const sitemap = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, lastmod]) => `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`).join('\n')}
</urlset>`;

const S = 'https://steamhardwarestock.com';

test('the IndexNow key file is served from the site root with the key as its body', () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8').trim(), INDEXNOW_KEY);
});

test('only new URLs and URLs with a new lastmod are submitted', () => {
  const before = sitemap([[`${S}/`, '2026-10-17T00:00:00.000Z'], [`${S}/about`], [`${S}/steam-deck`, '2026-10-10T00:00:00.000Z']]);
  const after = sitemap([[`${S}/`, '2026-10-17T00:00:00.000Z'], [`${S}/about`], [`${S}/steam-deck`, '2026-10-19T08:00:00.000Z'], [`${S}/steam-deck-black-friday`]]);
  assert.deepEqual(changedUrls(before, after), [`${S}/steam-deck`, `${S}/steam-deck-black-friday`]);
  assert.deepEqual(changedUrls(after, after), []);
});

test('with no previous sitemap every URL is submitted', () => {
  const after = sitemap([[`${S}/`], [`${S}/about`]]);
  assert.deepEqual(changedUrls(null, after), [`${S}/`, `${S}/about`]);
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
