import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import * as feed from '../lib/feed.mjs';
import { mergeEvent } from '../lib/history-merge.mjs';
import { PRODUCTS, REGIONS, VALVE_SELLS } from '../lib/products.mjs';
import { tmpDir } from './helpers/tmp.mjs';

// Looked up when called, so a missing export or Function fails its own tests.
const feedScope = (...a) => feed.feedScope(...a);
const buildRss = (...a) => feed.buildRss(...a);
const buildAtom = (...a) => feed.buildAtom(...a);
const fn = (rel) => async (ctx) => (await import(`../functions/${rel}`)).onRequestGet(ctx);
const scopeRss = fn('[scope]/rss.xml.js');
const scopeAtom = fn('[scope]/feed.xml.js');
const pairRss = fn('[scope]/[region]/rss.xml.js');
const pairAtom = fn('[scope]/[region]/feed.xml.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://steamhardwarestock.com';
const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'entry' || name === 'item' || name === 'link' || name === 'atom:link' });
const fixture = () => JSON.parse(readFileSync(path.join(root, 'test/fixtures/feed-stock-change.json'), 'utf8'));

// One status change: the Steam Deck comes into stock in Poland.
const CHANGE = { key: 'steam-deck:PL', productId: 'steam-deck', productName: 'Steam Deck', region: 'PL', source: 'steam', available: true, status: 'in_stock', ts: '2026-11-13T15:00:00.000Z' };
const GUID = 'tag:steamhardwarestock.com,2026:steam-deck:PL:2026-11-13T15:00:00.000Z';
function changed() {
  const history = fixture();
  assert.equal(mergeEvent(history, CHANGE), true);
  return history;
}

const rssItems = (xml) => parser.parse(xml).rss.channel.item || [];
const atomEntries = (xml) => parser.parse(xml).feed.entry || [];

// Every feed path the site serves, global and scoped.
const tracked = VALVE_SELLS.map((cc) => cc.toLowerCase());
const allPaths = [
  '',
  ...PRODUCTS.map((p) => `/${p.id}`),
  ...tracked.map((cc) => `/${cc}`),
  ...PRODUCTS.flatMap((p) => tracked.map((cc) => `/${p.id}/${cc}`))
];
const scopeOf = (p) => feedScope(p.split('/').filter(Boolean));

test('one status change lands in exactly its product, country and product+country feeds, plus the global one', () => {
  const history = changed();
  const expected = ['', '/steam-deck', '/pl', '/steam-deck/pl'];
  const hits = { rss: [], atom: [] };
  for (const p of allPaths) {
    const scope = scopeOf(p);
    assert.ok(scope, `${p || '/'} is a feed`);
    if (rssItems(buildRss(history, scope)).some((i) => i.guid['#text'] === GUID)) hits.rss.push(p);
    if (atomEntries(buildAtom(history, scope)).some((e) => e.id === GUID)) hits.atom.push(p);
  }
  assert.deepEqual(hits.rss, expected);
  assert.deepEqual(hits.atom, expected);
});

test('the change reads the same in every feed that carries it', () => {
  const history = changed();
  for (const p of ['/steam-deck', '/pl', '/steam-deck/pl']) {
    const [item] = rssItems(buildRss(history, scopeOf(p)));
    assert.equal(item.title, 'Steam Deck in Poland: In stock', p);
    assert.equal(item.link[0], `${SITE}/steam-deck/pl`, p);
    assert.equal(item.pubDate, 'Fri, 13 Nov 2026 15:00:00 GMT', p);
    assert.equal(item.guid['#text'], GUID, p);
    assert.equal(item.guid['@_isPermaLink'], 'false', p);
    const [entry] = atomEntries(buildAtom(history, scopeOf(p)));
    assert.equal(entry.id, GUID, p);
    assert.equal(entry.updated, CHANGE.ts, p);
  }
});

test('scoped feeds keep only their own product and country', () => {
  const history = changed();
  const titles = (p) => rssItems(buildRss(history, scopeOf(p))).map((i) => i.title);
  assert.deepEqual(titles('/steam-deck'), ['Steam Deck in Poland: In stock', 'Steam Deck in United States: In stock', 'Steam Deck in Poland: Out of stock']);
  assert.deepEqual(titles('/pl'), ['Steam Deck in Poland: In stock', 'Steam Frame in Poland: Waitlist', 'Steam Deck in Poland: Out of stock']);
  assert.deepEqual(titles('/steam-deck/pl'), ['Steam Deck in Poland: In stock', 'Steam Deck in Poland: Out of stock']);
  assert.deepEqual(titles('/steam-controller/pl'), []);
});

test('each scoped feed names itself, links its page and is valid XML', () => {
  const history = changed();
  const cases = [
    ['/steam-deck', 'Steam Deck stock changes', `${SITE}/steam-deck`],
    ['/pl', 'Steam hardware stock changes in Poland', `${SITE}/history`],
    ['/steam-deck/pl', 'Steam Deck stock changes in Poland', `${SITE}/steam-deck/pl`]
  ];
  for (const [p, title, link] of cases) {
    const rss = buildRss(history, scopeOf(p));
    assert.equal(XMLValidator.validate(rss), true, p);
    const ch = parser.parse(rss).rss.channel;
    assert.equal(ch.title, title, p);
    assert.equal(ch.link[0], link, p);
    assert.equal(ch['atom:link'][0]['@_href'], `${SITE}${p}/rss.xml`, p);
    assert.equal(ch.lastBuildDate, 'Fri, 13 Nov 2026 15:00:00 GMT', p);
    const atom = buildAtom(history, scopeOf(p));
    assert.equal(XMLValidator.validate(atom), true, p);
    const feed = parser.parse(atom).feed;
    assert.equal(feed.title, title, p);
    assert.equal(feed.id, `${SITE}${p}/feed.xml`, p);
    assert.deepEqual(feed.link.map((l) => [l['@_rel'], l['@_href']]), [['self', `${SITE}${p}/feed.xml`], ['alternate', link]], p);
  }
});

test('the global feed is unchanged by the scoping', () => {
  const history = changed();
  assert.equal(buildRss(history), buildRss(history, feedScope([])));
  assert.equal(buildAtom(history), buildAtom(history, feedScope([])));
  assert.match(buildRss(history), /<atom:link rel="self" type="application\/rss\+xml" href="https:\/\/steamhardwarestock\.com\/rss\.xml"\/>/);
});

test('only products and tracked lowercase countries are feeds', () => {
  for (const segs of [['nope'], ['jp'], ['uk'], ['PL'], ['steam-deck', 'jp'], ['steam-deck', 'status'], ['steam-deck', 'PL'], ['pl', 'steam-deck'], ['nope', 'pl']]) {
    assert.equal(feedScope(segs), null, segs.join('/'));
  }
  const untracked = REGIONS.filter((r) => !VALVE_SELLS.includes(r.code));
  assert.ok(untracked.length > 0);
  for (const r of untracked) assert.equal(feedScope([r.code.toLowerCase()]), null, r.code);
});

function fakeKv(value) {
  return { STOCK_KV: { get: async () => value, put: async () => { throw new Error('feeds never write KV'); } } };
}
function fakeCache() {
  const store = new Map();
  return { store, match: async (req) => store.get(req.url)?.clone(), put: async (req, res) => { store.set(req.url, res); } };
}
async function call(handler, url, params) {
  const cache = fakeCache();
  let nexted = false;
  const res = await handler({
    request: new Request(`${SITE}${url}`), params, env: fakeKv(JSON.stringify(changed())), cache, waitUntil() {},
    next: async () => { nexted = true; return new Response('not found', { status: 404 }); }
  });
  return { res, nexted, cache };
}

test('the feed functions serve the scoped feeds from KV', async () => {
  const cases = [
    [scopeRss, '/steam-deck/rss.xml', { scope: 'steam-deck' }, 'application/rss+xml'],
    [scopeAtom, '/steam-deck/feed.xml', { scope: 'steam-deck' }, 'application/atom+xml'],
    [scopeRss, '/pl/rss.xml', { scope: 'pl' }, 'application/rss+xml'],
    [scopeAtom, '/pl/feed.xml', { scope: 'pl' }, 'application/atom+xml'],
    [pairRss, '/steam-deck/pl/rss.xml', { scope: 'steam-deck', region: 'pl' }, 'application/rss+xml'],
    [pairAtom, '/steam-deck/pl/feed.xml', { scope: 'steam-deck', region: 'pl' }, 'application/atom+xml']
  ];
  for (const [handler, url, params, type] of cases) {
    const { res, nexted, cache } = await call(handler, url, params);
    assert.equal(nexted, false, url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('content-type'), `${type}; charset=utf-8`, url);
    assert.match(res.headers.get('cache-control'), /s-maxage=600/, url);
    const body = await res.text();
    assert.ok(body.includes(GUID), url);
    assert.ok(body.includes(`${SITE}${url}`), `${url} links itself`);
    assert.deepEqual([...cache.store.keys()], [`${SITE}${url}`], `${url} caches under its own path`);
  }
});

test('feed paths that are not feeds fall through to the 404 page', async () => {
  const cases = [
    [scopeRss, '/jp/rss.xml', { scope: 'jp' }],
    [scopeAtom, '/uk/feed.xml', { scope: 'uk' }],
    [scopeRss, '/PL/rss.xml', { scope: 'PL' }],
    [scopeRss, '/nope/rss.xml', { scope: 'nope' }],
    [pairRss, '/steam-deck/jp/rss.xml', { scope: 'steam-deck', region: 'jp' }],
    [pairAtom, '/steam-deck/status/feed.xml', { scope: 'steam-deck', region: 'status' }],
    [pairRss, '/pl/steam-deck/rss.xml', { scope: 'pl', region: 'steam-deck' }]
  ];
  for (const [handler, url, params] of cases) {
    const { res, nexted, cache } = await call(handler, url, params);
    assert.equal(nexted, true, url);
    assert.equal(res.status, 404, url);
    assert.equal(cache.store.size, 0, url);
  }
});

// Cloudflare Pages' rule matching for _routes.json, as in workers-sdk
// packages/wrangler/templates/pages-dev-util.ts (isRoutingRuleMatch).
function ruleMatches(pathname, rule) {
  let r;
  if (rule === '/' || rule === '/*') r = rule;
  else if (rule.endsWith('/*')) r = `${rule.slice(0, -2)}(/*)?`;
  else if (rule.endsWith('/')) r = `${rule.slice(0, -1)}(/)?`;
  else if (rule.endsWith('*')) r = rule;
  else r = `${rule}(/)?`;
  return new RegExp(`^${r.replaceAll('.', '\\.').replaceAll('*', '.*')}$`).test(pathname);
}

let built;
function build() {
  if (built) return built;
  const dist = tmpDir('shs-scoped-');
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '1' }, stdio: 'pipe' });
  built = dist;
  return dist;
}

test('_routes.json sends feed paths and existing functions to Functions, and static pages to the assets', () => {
  const routes = JSON.parse(readFileSync(path.join(build(), '_routes.json'), 'utf8'));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.exclude, []);
  const hits = (p) => routes.include.some((rule) => ruleMatches(p, rule)) && !routes.exclude.some((rule) => ruleMatches(p, rule));
  const functionPaths = ['/status.json', '/api/history', '/feed.xml', '/rss.xml', '/proxy',
    '/steam-deck/rss.xml', '/steam-deck/feed.xml', '/pl/rss.xml', '/pl/feed.xml', '/steam-deck/pl/rss.xml', '/steam-deck/pl/feed.xml'];
  for (const p of functionPaths) assert.ok(hits(p), `${p} runs a Function`);
  const staticPaths = ['/', '/index.html', '/history', '/steam-deck', '/steam-deck/', '/steam-deck/pl', '/steam-deck/status', '/how-it-works',
    '/styles.css', '/app.js', '/sitemap.xml', '/robots.txt', '/icons/icon-192.png', '/steam-deck-black-friday'];
  for (const p of staticPaths) assert.ok(!hits(p), `${p} is served as a static asset`);
  // Every Function file has a route.
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const file of walk(path.join(root, 'functions'))) {
    const rel = path.relative(path.join(root, 'functions'), file).split(path.sep).join('/');
    if (rel.split('/').some((s) => s.startsWith('_'))) continue;
    const sample = '/' + rel.replace(/\.js$/, '').replace('[scope]', 'steam-deck').replace('[region]', 'pl');
    assert.ok(hits(sample), `${rel} is reachable at ${sample}`);
  }
});

const alternates = (html) => [...html.matchAll(/<link rel="alternate" type="application\/(?:rss|atom)\+xml" title="([^"]*)" href="([^"]*)">/g)].map((m) => m[2]);

test('a product page links its product feed, RSS first, and not the global feed', () => {
  const dist = build();
  for (const p of PRODUCTS) {
    const html = readFileSync(path.join(dist, `${p.id}.html`), 'utf8');
    assert.deepEqual(alternates(html), [`${SITE}/${p.id}/rss.xml`, `${SITE}/${p.id}/feed.xml`], p.id);
    assert.match(html, new RegExp(`<a href="/${p.id}/rss\\.xml" data-alert="rss" data-product="${p.id}">Or follow the RSS feed</a>`), p.id);
  }
  const status = readFileSync(path.join(dist, 'steam-machine', 'status.html'), 'utf8');
  assert.deepEqual(alternates(status), [`${SITE}/steam-machine/rss.xml`, `${SITE}/steam-machine/feed.xml`]);
});

test('a tracked country page links the product+country feed first and the country feed second', () => {
  const dist = build();
  const html = readFileSync(path.join(dist, 'steam-deck', 'pl.html'), 'utf8');
  assert.deepEqual(alternates(html), [
    `${SITE}/steam-deck/pl/rss.xml`, `${SITE}/steam-deck/pl/feed.xml`,
    `${SITE}/pl/rss.xml`, `${SITE}/pl/feed.xml`
  ]);
  assert.ok(html.includes(`<link rel="alternate" type="application/rss+xml" title="Steam Deck stock changes in Poland (RSS)" href="${SITE}/steam-deck/pl/rss.xml">`));
  for (const p of PRODUCTS) {
    for (const cc of tracked) {
      const page = readFileSync(path.join(dist, p.id, `${cc}.html`), 'utf8');
      assert.deepEqual(alternates(page).slice(0, 1), [`${SITE}/${p.id}/${cc}/rss.xml`], `${p.id}/${cc}`);
    }
  }
});

test('an untracked country page links no feed', () => {
  const dist = build();
  for (const r of REGIONS.filter((x) => !VALVE_SELLS.includes(x.code))) {
    const html = readFileSync(path.join(dist, 'steam-deck', `${r.code.toLowerCase()}.html`), 'utf8');
    assert.deepEqual(alternates(html), [], r.code);
  }
});
