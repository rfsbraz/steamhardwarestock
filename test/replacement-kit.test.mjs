import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';
import StockStatus from '../public/stock-status.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = '/steam-frame-replacement-kit';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) products[p.id][cc] = { status: 'out_of_stock', packages: p.packages.map((pk) => ({ id: pk.id, status: 'out_of_stock' })) };
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-kit-'));
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: { version: 1, generatedAt: '2026-10-26T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history: {}, prices: {} }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  return (file) => readFileSync(path.join(dir, 'd', file), 'utf8');
}

const read = build();
const pick = (html, re) => decode((html.match(re) || [])[1] || '');

test('the Steam Frame Accessory Replacement Kit is tracked by its Steam package', () => {
  const kit = PRODUCTS.find((p) => p.id === 'steam-frame-replacement-kit');
  assert.ok(kit, 'product missing');
  assert.equal(kit.name, 'Steam Frame Accessory Replacement Kit');
  assert.deepEqual(kit.packageIds, [1727366]);
  assert.deepEqual(kit.packages.map((p) => [p.id, p.priceUsd]), [[1727366, 49]]);
  assert.equal(kit.steamPath, '/app/4978460/Steam_Frame_Accessory_Replacement_Kit/');
});

test('a kit Steam will not sell to an anonymous check reads out of stock, even with units', () => {
  // US answer on 26 Oct 2026: inventory, high demand, purchase restricted.
  const us = { inventory_available: true, high_pending_orders: true, account_restricted_from_purchasing: true, allow_purchase_in_country: true, account_first_date_purchase_requirement: 1777273200 };
  assert.equal(StockStatus.classifyDetails(us).status, 'out_of_stock');
});

test('the replacement kit page has its title, description and H1', () => {
  const html = read('steam-frame-replacement-kit.html');
  assert.equal(pick(html, /<title>([^<]*)<\/title>/), 'Steam Frame Replacement Kit Restock by Country');
  const description = pick(html, /<meta name="description" content="([^"]*)"/);
  assert.match(description, /^Is the Steam Frame Replacement Kit in stock\?/);
  assert.ok(description.length <= 160, description);
  assert.equal(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/), 'Steam Frame Accessory Replacement Kit stock and availability by country');
  assert.equal(pick(read('steam-frame-replacement-kit/de.html'), /<title>([^<]*)<\/title>/), 'Frame Replacement Kit Stock in Germany: Out of stock');
});

test('the page says what is in the kit and keeps the purchase limit unconfirmed', () => {
  const body = text(read('steam-frame-replacement-kit.html'));
  assert.match(body, /face gasket, one head cushion and one standard light blocker/);
  assert.match(body, /Login for purchase/);
  assert.match(body, /27 Apr 2026/);
  assert.match(body, /only Steam Frame owners/);
  assert.match(body, /unverified/);
  assert.match(body, /checks without a Steam account/);
  assert.match(body, /Replacement Kit page on Steam \. These notes were last compared with Valve's page on 26 Oct 2026/);
});

test('nothing calls the replacement kit discontinued', () => {
  for (const file of ['steam-frame-replacement-kit.html', 'steam-frame-replacement-kit/us.html', 'steam-frame-replacement-kit/de.html']) {
    assert.doesNotMatch(read(file), /discontinued/i, file);
  }
});

test('the Frame and home pages link to the replacement kit page', () => {
  for (const file of ['steam-frame.html', 'index.html']) {
    assert.match(read(file), new RegExp(`<a href="${SLUG}">`), file);
  }
});

test('the replacement kit page and its country pages are in the sitemap', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, new RegExp(`<loc>https://steamhardwarestock.com${SLUG}</loc>`));
  assert.match(xml, new RegExp(`<loc>https://steamhardwarestock.com${SLUG}/de</loc>`));
});
