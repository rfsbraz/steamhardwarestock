import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import StockStatus from '../public/stock-status.js';
import { checkAll } from '../lib/steam.mjs';
import { buildStatusDoc } from '../lib/status-doc.mjs';
import { renderStatusPage, STATUS_PAGE_PRODUCTS, latestUpdate } from '../lib/status-page.mjs';
import { productById, VALVE_SELLS, REGIONS } from '../lib/products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = JSON.parse(readFileSync(new URL('./fixtures/hardware-items.json', import.meta.url)));
const { buttonFor, combineButtons, BUTTONS } = StockStatus;

test('button state is derived from the Steam fields', () => {
  assert.equal(buttonFor(fx['deck-us-in-stock']), 'buy');
  assert.equal(buttonFor(fx['dock-us-out-of-stock']), 'unavailable');
  assert.equal(buttonFor(fx['controller-us-reservation-open']), 'reserve');
  assert.equal(buttonFor(fx['frame-us-waitlist']), 'waitlist');
  assert.equal(buttonFor(fx['machine-us-waitlist']), 'waitlist');
  assert.equal(buttonFor(fx['deck-jp-not-sold']), 'unavailable');
  assert.equal(buttonFor(null), 'unavailable');
  assert.equal(buttonFor({ requires_reservation: true, reservation_not_allowed: true }), 'unavailable');
  assert.equal(buttonFor({ inventory_available: true, high_pending_orders: true }), 'unavailable');
  assert.equal(buttonFor({ inventory_available: true, account_restricted_from_purchasing: true }), 'unavailable');
  assert.deepEqual(Object.values(BUTTONS).map((b) => b.label), ['Buy', 'Reserve', 'Join waitlist', 'Unavailable']);
});

test('the button always agrees with the status', () => {
  const expect = { in_stock: 'buy', reservation_open: 'reserve', waitlist: 'waitlist', out_of_stock: 'unavailable', unavailable_in_region: 'unavailable' };
  for (const d of Object.values(fx)) assert.equal(buttonFor(d), expect[StockStatus.classifyDetails(d).status]);
});

test('a product takes the best button of its models', () => {
  assert.equal(combineButtons(['unavailable', 'waitlist', 'reserve']), 'reserve');
  assert.equal(combineButtons(['unavailable', 'buy']), 'buy');
  assert.equal(combineButtons([]), 'unavailable');
});

test('the checker records the button for each region and package in status.json', async () => {
  const fetchImpl = async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const details = input.packageid.map((packageid) => ({ ...fx['frame-us-waitlist'], packageid }));
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
  const { results } = await checkAll({ fetchImpl, regions: ['US', 'DE'] });
  const doc = buildStatusDoc(results, { generatedAt: 'now', intervalSeconds: 600 });
  assert.equal(doc.products['steam-frame'].US.button, 'waitlist');
  assert.equal(doc.products['steam-frame'].DE.packages[0].button, 'waitlist');
});

const statusDoc = { version: 1, generatedAt: '2026-10-13T12:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products: { 'steam-frame': { US: { status: 'waitlist', button: 'waitlist', packages: [] }, DE: { status: 'reservation_open', button: 'reserve', packages: [] } } } };

test('status pages exist for Frame, Machine and Controller only', () => {
  assert.deepEqual(STATUS_PAGE_PRODUCTS, ['steam-frame', 'steam-machine', 'steam-controller']);
});

test('the status page lists the sales mode in every region and the latest Valve update', () => {
  const frame = productById('steam-frame');
  const html = renderStatusPage(frame, statusDoc);
  assert.match(html, /<link rel="canonical" href="https:\/\/steamhardwarestock\.com\/steam-frame\/status">/);
  assert.match(html, /<h1>Steam Frame reservation status by country<\/h1>/);
  const row = (code) => html.match(new RegExp(`<tr><td><a href="/steam-frame/${code.toLowerCase()}">[\\s\\S]*?</tr>`))[0];
  assert.match(row('US'), /Join waitlist/);
  assert.match(row('DE'), /Reserve/);
  assert.match(row('FR'), /Not checked/);
  assert.match(row('BR'), /Not sold on Steam/);
  assert.equal((html.match(/<tr><td>/g) || []).length, REGIONS.length);
  const update = latestUpdate('steam-frame');
  assert.ok(html.includes(update.source));
  assert.match(html, /<time datetime="2026-10-09">/);
  assert.ok(!html.includes('—'));
});

test('every Valve update has a date, a summary and an official Steam source', () => {
  const updates = JSON.parse(readFileSync(path.join(root, 'data/valve-updates.json'), 'utf8'));
  for (const u of updates) {
    assert.match(u.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(u.source, /^https:\/\/store\.steampowered\.com\/news\//);
    assert.ok(u.summary.length > 50 && !u.summary.includes('—'));
  }
  for (const id of STATUS_PAGE_PRODUCTS) assert.ok(latestUpdate(id), id);
});

for (const cf of ['', '1']) {
  test(`status pages are built and in the sitemap (CF_PAGES=${cf || 'unset'})`, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-sales-'));
    writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: statusDoc, history: {}, prices: {} }));
    execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf }, stdio: 'pipe' });
    const sitemap = readFileSync(path.join(dir, 'd', 'sitemap.xml'), 'utf8');
    for (const id of STATUS_PAGE_PRODUCTS) {
      assert.match(readFileSync(path.join(dir, 'd', id, 'status', 'index.html'), 'utf8'), /reservation status by country/);
      assert.match(sitemap, new RegExp(`<loc>https://steamhardwarestock.com/${id}/status</loc>`));
    }
    assert.match(readFileSync(path.join(dir, 'd', 'steam-frame', 'index.html'), 'utf8'), /href="\/steam-frame\/status"/);
  });
}
