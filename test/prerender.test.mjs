import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prerender } from '../scripts/prerender.mjs';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';

const status = {
  version: 1,
  generatedAt: '2026-10-13T12:00:00.000Z',
  intervalSeconds: 600,
  regions: ['US', 'GB'],
  products: {
    'steam-deck': { US: { status: 'in_stock', packages: [] }, GB: { status: 'out_of_stock', packages: [] } },
    'steam-controller': { US: { status: 'reservation_open', estimate: '2027-01-03T20:49:00.000Z', packages: [] }, GB: { status: 'waitlist', packages: [] } }
  }
};
const history = { 'steam-deck:US': { lastInStock: '2026-10-13T11:00:00.000Z', events: [] } };

function setup() {
  const dist = mkdtempSync(path.join(tmpdir(), 'shs-'));
  writeFileSync(path.join(dist, 'index.html'), readFileSync(new URL('../public/index.html', import.meta.url)));
  return dist;
}

test('writes a page for every product and every product and region', async () => {
  const dist = setup();
  await prerender(dist, { status, history });
  for (const p of PRODUCTS) {
    assert.ok(existsSync(path.join(dist, `${p.id}.html`)), p.id);
    for (const r of REGIONS) assert.ok(existsSync(path.join(dist, p.id, `${r.code.toLowerCase()}.html`)), `${p.id}/${r.code}`);
  }
});

test('landing pages carry the status and the analytics script', async () => {
  const dist = setup();
  await prerender(dist, { status, history });
  const deckUs = readFileSync(path.join(dist, 'steam-deck', 'us.html'), 'utf8');
  assert.match(deckUs, /In stock/);
  assert.match(deckUs, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(deckUs, /Last check/);
  const controller = readFileSync(path.join(dist, 'steam-controller.html'), 'utf8');
  assert.match(controller, /Reservations open/);
  assert.match(controller, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  const notSold = readFileSync(path.join(dist, 'steam-deck', 'jp.html'), 'utf8');
  assert.match(notSold, /Not sold here/);
});

test('the homepage shows real counts and the last check without JavaScript', async () => {
  const dist = setup();
  await prerender(dist, { status, history });
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /id="availableCount">1</);
  assert.doesNotMatch(html, /id="lastChecked">Never</);
  assert.match(html, /datetime="2026-10-13T12:00:00.000Z"/);
  assert.match(html, /Steam Controller/);
});

test('without data the pages still build and say so', async () => {
  const dist = setup();
  await prerender(dist, { status: null, history: {} });
  const html = readFileSync(path.join(dist, 'steam-deck', 'us.html'), 'utf8');
  assert.match(html, /Not checked yet/);
});

test('loadData reads status and history from PRERENDER_SOURCE_URL', async () => {
  const { loadData } = await import('../scripts/prerender.mjs');
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url.pathname);
    return new Response(url.pathname === '/status.json' ? '{"generatedAt":"g"}' : '{"k":{}}');
  };
  const out = await loadData({ env: { PRERENDER_SOURCE_URL: 'https://example.test', PRERENDER_OFFLINE: '1' }, fetchImpl });
  assert.deepEqual(seen, ['/status.json', '/api/history']);
  assert.equal(out.status.generatedAt, 'g');
  assert.deepEqual(out.history, { k: {} });
});
