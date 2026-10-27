import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import { buildAtom, buildRss, feedEvents, FEED_LIMIT } from '../lib/feed.mjs';
import { onRequestGet as atomHandler } from '../functions/feed.xml.js';
import { onRequestGet as rssHandler } from '../functions/rss.xml.js';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const history = {
  'steam-deck:US': {
    productId: 'steam-deck', productName: 'Steam Deck', region: 'US', source: 'steam',
    events: [
      { ts: '2026-10-13T18:00:00.000Z', available: true, status: 'in_stock' },
      { ts: '2026-10-12T09:00:00.000Z', available: false, status: 'out_of_stock' }
    ]
  },
  'steam-frame:GB': {
    productId: 'steam-frame', productName: 'Steam Frame <&> "x"', region: 'GB', source: 'steam',
    events: [{ ts: '2026-10-13T08:00:00.000Z', available: false, status: 'waitlist' }]
  },
  'old:US': { productId: 'old', region: 'US', events: [{ ts: '2026-01-01T00:00:00.000Z', available: true }] }
};
const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'entry' || name === 'item' });

test('events are flattened newest first and capped', () => {
  const events = feedEvents(history);
  assert.deepEqual(events.map((e) => e.ts), ['2026-10-13T18:00:00.000Z', '2026-10-13T08:00:00.000Z', '2026-10-12T09:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  const big = { k: { productId: 'steam-deck', region: 'US', events: Array.from({ length: 80 }, (_, i) => ({ ts: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), available: i % 2 === 0 })) } };
  assert.equal(feedEvents(big).length, FEED_LIMIT);
});

test('Atom feed is valid XML with escaped titles, stable ids and links', () => {
  const xml = buildAtom(history);
  assert.equal(XMLValidator.validate(xml), true);
  const doc = parser.parse(xml).feed;
  assert.equal(doc['@_xmlns'], 'http://www.w3.org/2005/Atom');
  assert.equal(doc.updated, '2026-10-13T18:00:00.000Z');
  assert.equal(doc.entry.length, 4);
  const first = doc.entry[0];
  assert.equal(first.title, 'Steam Deck in United States: In stock');
  assert.equal(first.link['@_href'], 'https://steamhardwarestock.com/steam-deck/us');
  assert.equal(first.id, 'tag:steamhardwarestock.com,2026:steam-deck:US:2026-10-13T18:00:00.000Z');
  assert.match(xml, /Steam Frame &lt;&amp;&gt; &quot;x&quot; in United Kingdom: Waitlist/);
  assert.equal(doc.entry[3].title, 'old in United States: In stock', 'old events without status still read');
});

test('RSS feed is valid XML', () => {
  const xml = buildRss(history);
  assert.equal(XMLValidator.validate(xml), true);
  const ch = parser.parse(xml).rss.channel;
  assert.equal(ch.item.length, 4);
  assert.equal(ch.item[0].pubDate, 'Tue, 13 Oct 2026 18:00:00 GMT');
  assert.equal(ch.item[0].guid['#text'], 'tag:steamhardwarestock.com,2026:steam-deck:US:2026-10-13T18:00:00.000Z');
});

test('an empty history still gives a valid feed', () => {
  assert.equal(XMLValidator.validate(buildAtom({})), true);
  assert.equal(XMLValidator.validate(buildRss({})), true);
});

function fakeEnv(value) {
  let reads = 0;
  return { env: { STOCK_KV: { get: async () => { reads++; return value; }, put: async () => { throw new Error('feeds never write KV'); } } }, reads: () => reads };
}
function fakeCache() {
  const store = new Map();
  return { store, match: async (req) => store.get(req.url)?.clone(), put: async (req, res) => { store.set(req.url, res); } };
}

for (const [name, handler, type] of [['Atom', atomHandler, 'application/atom+xml'], ['RSS', rssHandler, 'application/rss+xml']]) {
  test(`${name} function serves from KV, then from the edge cache, without KV writes`, async () => {
    const kv = fakeEnv(JSON.stringify(history));
    const cache = fakeCache();
    const waits = [];
    const ctx = { request: new Request('https://steamhardwarestock.com/x.xml'), env: kv.env, waitUntil: (p) => waits.push(p), cache };
    const res = await handler(ctx);
    await Promise.all(waits);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), new RegExp(type.replace('+', '\\+')));
    assert.match(res.headers.get('cache-control'), /s-maxage=\d+/);
    assert.equal(XMLValidator.validate(await res.text()), true);
    const again = await handler(ctx);
    assert.equal(kv.reads(), 1, 'second request came from the cache');
    assert.equal(again.status, 200);
  });
}

test('feed function survives missing KV and bad JSON', async () => {
  for (const env of [{}, fakeEnv('not json').env]) {
    const res = await atomHandler({ request: new Request('https://x/feed.xml'), env, waitUntil() {}, cache: fakeCache() });
    assert.equal(res.status, 200);
    assert.equal(XMLValidator.validate(await res.text()), true);
  }
});

test('every built HTML page links both feeds', () => {
  const dist = tmpDir('shs-feed-');
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '1' }, stdio: 'pipe' });
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []));
  const files = walk(dist);
  assert.ok(files.length > 100);
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    assert.ok(html.includes('<link rel="alternate" type="application/atom+xml" title="Steam hardware stock changes" href="https://steamhardwarestock.com/feed.xml">'), f);
    assert.ok(html.includes('<link rel="alternate" type="application/rss+xml" title="Steam hardware stock changes (RSS)" href="https://steamhardwarestock.com/rss.xml">'), f);
  }
});
