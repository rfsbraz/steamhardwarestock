import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEAL_PICKS, MAX_DEALS, dealFrom, pickDeals, loadDeals } from '../lib/jsaux-feed.mjs';
import Affiliate from '../public/affiliate.js';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Recorded from https://jsaux.com/collections/all/products.json on 27 Oct 2026, trimmed to the fields we read.
const FEED = JSON.parse(readFileSync(path.join(root, 'test/fixtures/jsaux-products.json'), 'utf8'));
const byHandle = (h) => FEED.products.find((p) => p.handle === h);
const NOW = new Date('2026-10-27T06:00:00Z');

function fakeFetch({ feed = FEED, image = { status: 200, type: 'image/webp' } } = {}) {
  const calls = [];
  const fn = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname === '/collections/all/products.json') {
      if (feed instanceof Error) throw feed;
      if (typeof feed === 'number') return new Response('nope', { status: feed });
      const page = Number(url.searchParams.get('page') || 1);
      return Response.json(page === 1 ? feed : { products: [] });
    }
    return new Response(Buffer.from('img'), { status: image.status, headers: { 'content-type': image.type } });
  };
  fn.calls = calls;
  return fn;
}

test('uses the lowest in-stock variant and marks a sale only when compare_at_price is higher', () => {
  assert.deepEqual(
    { ...dealFrom(byHandle('steam-deck-docking-station')), image: undefined },
    { handle: 'steam-deck-docking-station', title: '5-in-1 Docking Station', url: 'https://jsaux.com/products/steam-deck-docking-station', price: 2999, was: 3999, image: undefined }
  );
  // Cheapest variant is 22.99 even though the first one listed is 23.99.
  assert.equal(dealFrom(byHandle('usb-c-pd-charger-for-steam-deck-ch6504-ch4504')).price, 2299);
  // Cheapest in-stock cable is 5.99 (was 9.99).
  assert.deepEqual([dealFrom(byHandle('100w-usb-c-to-usb-c-cable')).price, dealFrom(byHandle('100w-usb-c-to-usb-c-cable')).was], [599, 999]);
  // compare_at_price equal to the price is not a sale.
  const same = structuredClone(byHandle('steam-deck-screen-protector-1'));
  same.variants[0].compare_at_price = same.variants[0].price;
  assert.equal(dealFrom(same).was, null);
  // No compare_at_price at all.
  assert.equal(dealFrom(byHandle('travel-carrying-case-for-steam-controller')).was, null);
});

test('ignores the price of a sold-out variant', () => {
  const p = structuredClone(byHandle('steam-deck-docking-station'));
  p.variants[0].available = false;
  assert.deepEqual([dealFrom(p).price, dealFrom(p).was], [4999, null]);
});

test('skips sold-out products', () => {
  assert.equal(dealFrom(byHandle('pc0104-metal-bracket')), null);
});

test('skips anything made for Switch, ROG Ally or Legion even if it is picked', () => {
  const handle = 'multi-mode-joystick-cap-and-thumb-grip-with-lever-guard-set-for-switch-2';
  assert.equal(dealFrom(byHandle(handle)), null);
  const picked = pickDeals(FEED.products, { 'steam-controller': [handle, 'travel-carrying-case-for-steam-controller'] });
  assert.deepEqual(picked['steam-controller'].map((d) => d.handle), ['travel-carrying-case-for-steam-controller']);
});

test('the picks cover Deck, Dock and Controller, and every picked product is for the Steam Deck or Controller', () => {
  assert.deepEqual(Object.keys(DEAL_PICKS).sort(), ['steam-controller', 'steam-deck', 'steam-dock']);
  for (const handles of Object.values(DEAL_PICKS)) {
    for (const h of handles) {
      const p = byHandle(h);
      assert.ok(p, `${h} missing from the recorded feed`);
      assert.doesNotMatch(p.title, /switch|ally|legion/i);
    }
  }
});

test('the Steam Deck Dock page picks docks and links to the docking stations collection', () => {
  const deals = pickDeals(FEED.products)['steam-dock'];
  assert.equal(deals.length, MAX_DEALS);
  for (const d of deals) assert.match(d.title, /docking station/i, `${d.handle} is not a dock`);
  assert.deepEqual(Affiliate.JSAUX['steam-dock'].map((l) => l.path), ['/collections/docking-stations']);
});

test('keeps pick order, drops missing handles and shows at most four per page', () => {
  const picks = { 'steam-deck': ['gone', ...DEAL_PICKS['steam-deck'], 'steam-deck-screen-protector-1'] };
  const deals = pickDeals(FEED.products, picks)['steam-deck'];
  assert.equal(deals.length, MAX_DEALS);
  assert.deepEqual(deals.map((d) => d.handle), DEAL_PICKS['steam-deck'].slice(0, MAX_DEALS));
});

test('loadDeals copies resized images into the build and returns only local paths', async () => {
  const out = tmpDir('shs-deals-');
  const fetchImpl = fakeFetch();
  const feed = await loadDeals({ fetchImpl, outDir: out, now: NOW });
  assert.equal(feed.checkedAt, '2026-10-27T06:00:00.000Z');
  assert.deepEqual(Object.keys(feed.pages).sort(), ['steam-controller', 'steam-deck', 'steam-dock']);
  const deals = Object.values(feed.pages).flat();
  for (const d of deals) {
    assert.match(d.image, /^\/deals\/[a-z0-9-]+\.webp$/);
    assert.ok(readdirSync(out).includes(path.basename(d.image)));
  }
  assert.ok(!JSON.stringify(feed).includes('shopify'), 'no remote image URLs in the output');
  const imageCalls = fetchImpl.calls.filter((u) => u.hostname === 'cdn.shopify.com');
  assert.ok(imageCalls.length > 0);
  for (const u of imageCalls) assert.equal(u.searchParams.get('width'), '320');
});

test('loadDeals returns null when the feed fails, so pages keep the text links', async () => {
  const out = tmpDir('shs-deals-');
  assert.equal(await loadDeals({ fetchImpl: fakeFetch({ feed: new TypeError('fetch failed') }), outDir: out, now: NOW }), null);
  assert.equal(await loadDeals({ fetchImpl: fakeFetch({ feed: 503 }), outDir: out, now: NOW }), null);
  assert.equal(await loadDeals({ fetchImpl: fakeFetch({ feed: { nope: true } }), outDir: out, now: NOW }), null);
});

test('a product whose image cannot be copied is left out', async () => {
  const out = tmpDir('shs-deals-');
  assert.equal(await loadDeals({ fetchImpl: fakeFetch({ image: { status: 404, type: 'text/html' } }), outDir: out, now: NOW }), null);
  assert.equal(await loadDeals({ fetchImpl: fakeFetch({ image: { status: 200, type: 'text/html' } }), outDir: out, now: NOW }), null);
});

function build(extraEnv) {
  const dist = tmpDir('shs-dist-');
  const fixture = path.join(dist, '..', `${path.basename(dist)}-data.json`);
  writeFileSync(fixture, JSON.stringify({ status: null, history: {}, prices: {} }));
  const stub = path.join(root, 'test/fixtures/jsaux-fetch.mjs');
  execFileSync(process.execPath, ['--import', stub, 'scripts/build.js'], {
    cwd: root,
    env: { ...process.env, PRERENDER_OFFLINE: '', PRERENDER_FIXTURE: fixture, PRERENDER_SOURCE_URL: '', CF_PAGES: '', AFFILIATE_JSAUX_REF: '', AFFILIATE_AMAZON_TAG: '', AFFILIATE_AMAZON_ENABLED: '', BUILD_DIST: dist, JSAUX_STUB: '', ...extraEnv },
    stdio: 'pipe'
  });
  const asset = readdirSync(dist).find((f) => /^affiliate\.[a-f0-9]{8}\.js$/.test(f));
  return { dist, affiliateJs: readFileSync(path.join(dist, asset), 'utf8'), read: (rel) => readFileSync(path.join(dist, rel), 'utf8') };
}

test('the build copies deal images and bakes the deals into affiliate.js', () => {
  const out = build({ AFFILIATE_JSAUX_REF: 'ref123' });
  assert.ok(readdirSync(path.join(out.dist, 'deals')).includes('steam-deck-docking-station.webp'));
  assert.ok(out.affiliateJs.includes('"deals":{"checkedAt":'), 'deals not baked into affiliate.js');
  assert.ok(out.affiliateJs.includes('"/deals/steam-deck-docking-station.webp"'));
});

test('the build skips the feed without a JSAUX ref and survives a blocked feed', () => {
  const noRef = build({});
  assert.ok(!noRef.affiliateJs.includes('"deals"'));
  const blocked = build({ AFFILIATE_JSAUX_REF: 'ref123', JSAUX_STUB: 'fail' });
  assert.ok(!blocked.affiliateJs.includes('"deals"'));
  assert.ok(blocked.affiliateJs.includes('"ref123"'));
});

test('built pages show cards where there are deals and text links elsewhere', () => {
  const out = build({ AFFILIATE_JSAUX_REF: 'ref123' });
  for (const rel of ['steam-deck.html', 'steam-deck/us.html', 'steam-dock.html', 'steam-controller.html']) {
    const html = out.read(rel);
    assert.ok(html.includes('class="deal-strip"'), `${rel} has no cards`);
    assert.ok(!html.includes('class="affiliate-block"'), `${rel} still has the text links`);
    const strip = html.slice(html.indexOf('class="deal-strip"'), html.indexOf('</aside>', html.indexOf('class="deal-strip"')));
    assert.ok(!/<img [^>]*src="https?:/.test(strip), `${rel} loads a remote image`);
  }
  assert.ok(out.read('steam-machine/gb.html').includes('class="affiliate-block"'));
  const blocked = build({ AFFILIATE_JSAUX_REF: 'ref123', JSAUX_STUB: 'fail' });
  assert.ok(blocked.read('steam-deck.html').includes('class="affiliate-block"'), 'blocked feed keeps the text links');
  assert.ok(!blocked.read('steam-deck.html').includes('deal-strip'));
});
