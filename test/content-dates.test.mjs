import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';
import { nextManifest } from '../lib/content-dates.mjs';
import { changedUrls } from '../scripts/indexnow.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = 'https://steamhardwarestock.com';
const A = `${S}/steam-dock/fr`;
const B = `${S}/steam-deck/gb`;
const OLD = '2026-10-27T10:10:36.000Z';
const REV_TIME = '2026-11-01T11:00:00.000Z';
const DATA_TIME = '2026-11-01T11:20:00.000Z';
const STOCK = '2026-10-30T08:00:00.000Z';
const at = (hashes, opts) => nextManifest({ hashes, rev: 'r2', revTime: REV_TIME, dataTime: DATA_TIME, seed: {}, ...opts });

test('an unchanged page keeps the date its content last changed', () => {
  const previous = { version: 2, rev: 'r1', pages: { [A]: { hash: 'a', changed: OLD } } };
  assert.deepEqual(at({ [A]: 'a' }, { previous }).pages[A], { hash: 'a', changed: OLD });
});

test('a changed page is dated by the commit when the code changed, or by the check when only data changed', () => {
  const previous = { version: 2, rev: 'r1', pages: { [A]: { hash: 'a', changed: OLD } } };
  assert.equal(at({ [A]: 'A' }, { previous }).pages[A].changed, REV_TIME);
  assert.equal(at({ [A]: 'A' }, { previous: { ...previous, rev: 'r2' } }).pages[A].changed, DATA_TIME);
});

test('a new URL is dated when it first appears', () => {
  const previous = { version: 2, rev: 'r1', pages: {} };
  assert.equal(at({ [A]: 'a' }, { previous }).pages[A].changed, REV_TIME);
});

test('a page from the old hash-only manifest gets its seeded date when its hash still matches', () => {
  const previous = { version: 1, pages: { [A]: 'a', [B]: 'b' } };
  const next = at({ [A]: 'a', [B]: 'B' }, { previous, seed: { [A]: { hash: 'a', changed: OLD } } });
  assert.deepEqual(next.pages[A], { hash: 'a', changed: OLD });
  assert.equal(next.pages[B].changed, REV_TIME, 'a changed page is dated by this deploy, not the seed');
  assert.deepEqual(at({ [A]: 'a' }, { previous }).pages[A], { hash: 'a' }, 'no seed means no date, not a made-up one');
  const stale = at({ [A]: 'a' }, { previous, seed: { [A]: { hash: 'x', changed: OLD } } });
  assert.deepEqual(stale.pages[A], { hash: 'a' }, 'a seed worked out for other content does not date this page');
});

test('without a previous manifest nothing is dated by this build', () => {
  const next = at({ [A]: 'a', [B]: 'b' }, { previous: null, seed: { [A]: { hash: 'a', changed: OLD } } });
  assert.deepEqual(next.pages, { [A]: { hash: 'a', changed: OLD }, [B]: { hash: 'b' } });
});

test('IndexNow compares hashes across the old and new manifest formats', () => {
  const v1 = { version: 1, pages: { [A]: 'a', [B]: 'b' } };
  const v2 = { version: 2, rev: 'r2', pages: { [A]: { hash: 'a', changed: OLD }, [B]: { hash: 'B', changed: REV_TIME } } };
  assert.deepEqual(changedUrls(v1, v2), [B]);
  assert.deepEqual(changedUrls(v2, v2), []);
});

function build({ previous, history = {}, gitRev = false }) {
  const dist = tmpDir('shs-dates-');
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = Object.fromEntries(VALVE_SELLS.map((cc) => [cc, { status: 'out_of_stock', packages: p.packages.map((pk) => ({ id: pk.id, status: 'out_of_stock' })) }]));
  }
  const fixture = `${dist}-fixture.json`;
  writeFileSync(fixture, JSON.stringify({ status: { version: 1, generatedAt: DATA_TIME, intervalSeconds: 600, regions: VALVE_SELLS, products }, history, prices: {} }));
  const env = { ...process.env, BUILD_DIST: dist, PRERENDER_FIXTURE: fixture, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '1', PRERENDER_REV: 'r2', PRERENDER_REV_TIME: REV_TIME };
  if (gitRev) {
    delete env.PRERENDER_REV;
    delete env.PRERENDER_REV_TIME;
  }
  if (previous) {
    env.PRERENDER_PREVIOUS_MANIFEST = `${dist}-previous.json`;
    writeFileSync(env.PRERENDER_PREVIOUS_MANIFEST, JSON.stringify(previous));
  }
  const started = new Date().toISOString();
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env, stdio: 'pipe' });
  const xml = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  const lastmod = Object.fromEntries([...xml.matchAll(/<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => [m[1], m[2] || null]));
  return { started, lastmod, manifest: JSON.parse(readFileSync(path.join(dist, 'indexnow-manifest.json'), 'utf8')) };
}

test('the build writes dated hashes and sets lastmod to the later of the stock event and the content change', () => {
  const first = build({ previous: { version: 2, rev: 'r1', pages: {} } });
  assert.equal(first.manifest.version, 2);
  assert.equal(first.manifest.rev, 'r2');
  assert.equal(first.lastmod[A], REV_TIME, 'every URL is new, so it is dated by the commit');
  const history = { 'steam-dock:FR': { events: [{ ts: STOCK, status: 'out_of_stock' }] } };
  const withStock = build({ previous: first.manifest, history });
  const dated = Object.fromEntries(Object.entries(withStock.manifest.pages).map(([loc, e]) => [loc, { ...e, changed: OLD }]));
  const again = build({ previous: { version: 2, rev: 'r2', pages: dated }, history });
  assert.equal(again.lastmod[B], OLD, 'the content change is newer than any stock event');
  assert.equal(again.lastmod[A], STOCK, 'the stock event is newer than the content change');
});

test('no sitemap lastmod is the build time', () => {
  const runs = [{ previous: null }, { previous: { version: 1, pages: {} } }, { previous: { version: 2, rev: 'r1', pages: {} } }, { previous: { version: 2, rev: 'r1', pages: {} }, gitRev: true }];
  for (const run of runs) {
    const { started, lastmod } = build(run);
    const late = Object.entries(lastmod).filter(([, v]) => v && v >= started);
    assert.deepEqual(late, [], `lastmod at or after the build started (${started})`);
  }
});

function buildWith(data, previous) {
  const dist = tmpDir('shs-stable-');
  const env = { ...process.env, BUILD_DIST: dist, PRERENDER_FIXTURE: `${dist}-fixture.json`, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '1', PRERENDER_REV: 'r2', PRERENDER_REV_TIME: REV_TIME };
  writeFileSync(env.PRERENDER_FIXTURE, JSON.stringify(data));
  if (previous) {
    env.PRERENDER_PREVIOUS_MANIFEST = `${dist}-previous.json`;
    writeFileSync(env.PRERENDER_PREVIOUS_MANIFEST, JSON.stringify(previous));
  }
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env, stdio: 'pipe' });
  return JSON.parse(readFileSync(path.join(dist, 'indexnow-manifest.json'), 'utf8'));
}

const live = JSON.parse(readFileSync(path.join(root, 'test/fixtures/live-2026-10-27.json'), 'utf8'));
const checkedAt = (data, iso) => ({ ...data, status: { ...data.status, generatedAt: iso } });
// Just past midnight UTC, so the check date rolls over. Later that day a
// 28 Sep restock leaves the 30-day timeline, which is a real change.
const NEXT_DAY = '2026-10-28T00:10:40.000Z';
const moved = (a, b) => Object.keys(b.pages).filter((loc) => a.pages[loc]?.hash !== b.pages[loc].hash || a.pages[loc]?.changed !== b.pages[loc].changed);

test('a check on a later day with the same stock and prices moves no content date', () => {
  const first = buildWith(live, { version: 3, rev: 'r2', pages: {} });
  const nextDay = buildWith(checkedAt(live, NEXT_DAY), first);
  assert.deepEqual(moved(first, nextDay), []);
});

test('a stock change moves only the pages that show that product and country', () => {
  const first = buildWith(checkedAt(live, NEXT_DAY), { version: 3, rev: 'r2', pages: {} });
  const data = structuredClone(checkedAt(live, new Date(Date.parse(NEXT_DAY) + 600000).toISOString()));
  const cell = data.status.products['steam-dock'].FR;
  cell.status = 'in_stock';
  for (const pkg of cell.packages) pkg.status = 'in_stock';
  const urls = moved(first, buildWith(data, first));
  assert.ok(urls.includes(`${S}/steam-dock/fr`), 'the dock page for France moves');
  assert.ok(urls.includes(`${S}/steam-machine/fr`), 'other French pages list the dock and move too');
  const elsewhere = urls.filter((loc) => /\/[a-z-]+\/[a-z]{2}$/.test(loc) && !loc.endsWith('/fr'));
  assert.deepEqual(elsewhere, [], 'no country page outside France moves');
});

test('pages dated by an older manifest take their repaired seed date when the hash matches', () => {
  const RESTAMP = '2026-11-03T03:10:40.209Z';
  const previous = { version: 2, rev: 'r1', pages: { [A]: { hash: 'old-a', changed: RESTAMP }, [B]: { hash: 'old-b', changed: RESTAMP } } };
  const seed = { [A]: { hash: 'a', changed: OLD }, [B]: { hash: 'b', changed: OLD } };
  const next = at({ [A]: 'a', [B]: 'B' }, { previous, seed });
  assert.deepEqual(next.pages[A], { hash: 'a', changed: OLD });
  assert.equal(next.pages[B].changed, REV_TIME, 'a page that no longer matches its seed is dated by this deploy');
  assert.equal(next.version, 3);
  const later = at({ [A]: 'a' }, { previous: { version: 3, rev: 'r2', pages: { [A]: { hash: 'x', changed: RESTAMP } } }, seed });
  assert.equal(later.pages[A].changed, DATA_TIME, 'once a current manifest is live the seed no longer applies');
});
