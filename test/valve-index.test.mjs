import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';
import StockStatus from '../public/stock-status.js';
import { formatMessage } from '../lib/notify.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = '/valve-index';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

// Steam on 26 Oct 2026: four parts with inventory in the US, none elsewhere.
const PACKAGES = [354232, 354235, 566031, 566409, 354234, 580180, 359829, 354233, 354231];
const US_IN_STOCK = [354232, 354235, 566031, 580180];

function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const inStock = (id) => p.id === 'valve-index' && cc === 'US' && US_IN_STOCK.includes(id);
      const packages = p.packages.map((pk) => ({ id: pk.id, status: inStock(pk.id) ? 'in_stock' : 'out_of_stock' }));
      products[p.id][cc] = { status: packages.some((pk) => pk.status === 'in_stock') ? 'in_stock' : 'out_of_stock', packages };
    }
  }
  const prices = { 354232: { US: { amount: 399.2, currency: 'USD', formatted: '$399.20', discountPct: 20, formattedOriginal: '$499.00' } } };
  const dir = tmpDir('shs-index-');
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: { version: 1, generatedAt: '2026-10-26T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history: {}, prices }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  return (file) => readFileSync(path.join(dir, 'd', file), 'utf8');
}

const read = build();
const pick = (html, re) => decode((html.match(re) || [])[1] || '');

test('the Valve Index is tracked as nine separate parts', () => {
  const index = PRODUCTS.find((p) => p.id === 'valve-index');
  assert.ok(index, 'product missing');
  assert.equal(index.name, 'Valve Index');
  assert.equal(index.parts, true);
  assert.deepEqual(index.packageIds, PACKAGES);
  assert.deepEqual(index.packages.map((p) => p.id), PACKAGES);
  assert.equal(index.packages[0].label, 'Headset');
  assert.ok(index.packages.every((p) => p.label), 'every part has a label');
  assert.equal(index.steamPath, '/hardware/valveindex');
});

test('a country with some parts in stock never reads plain In stock', () => {
  assert.equal(StockStatus.partsLabel(['in_stock', 'out_of_stock', 'in_stock']), '2 of 3 parts in stock');
  assert.equal(StockStatus.partsLabel(['out_of_stock', 'out_of_stock']), null);

  const page = read('valve-index.html');
  const usRow = page.match(/<tr data-cc="US">[\s\S]*?<\/tr>/)[0];
  assert.match(usRow, /4 of 9 parts in stock/);
  assert.doesNotMatch(usRow, />In stock</);

  const us = read('valve-index/us.html');
  assert.equal(pick(us, /<title>([^<]*)<\/title>/), 'Valve Index Stock in United States: 4 of 9 parts in stock');
  assert.match(pick(us, /<meta name="description" content="([^"]*)"/), /^Valve Index in United States: 4 of 9 parts in stock on the Steam Store\./);
  assert.match(text(us), /4 of 9 parts in stock/);
  assert.doesNotMatch(text(us), /it was in stock at the last check/);
  assert.match(text(read('steam-deck/us.html')), /Valve Index 4 of 9 parts in stock/);

  assert.equal(pick(read('valve-index/de.html'), /<title>([^<]*)<\/title>/), 'Valve Index Stock in Germany: Out of stock');
});

test('every part is listed with its own status, priced or not', () => {
  const us = text(read('valve-index/us.html'));
  for (const part of ['Headset', 'Base Station', 'Replacement Left Controller', 'Replacement Right Controller', 'Controllers (pair)', 'Replacement Tether', 'Face Gasket 2 Pack', 'Headset + Controllers', 'Full VR Kit']) {
    assert.match(us, new RegExp(`${part.replace(/[()+]/g, '\\$&')} (\\$[\\d.]+ )?(In stock|Out of stock)`), part);
  }
  assert.match(us, /Headset \$399\.20 In stock/);
  assert.match(us, /Full VR Kit Out of stock/);

  const page = text(read('valve-index.html'));
  assert.match(page, /Remaining parts/);
  assert.match(page, /Base Station In stock in 1 of 31 countries/);
  assert.match(page, /Full VR Kit In stock in 0 of 31 countries/);
});

test('the page is a clearance page and promises no restock', () => {
  const html = read('valve-index.html');
  assert.equal(pick(html, /<title>([^<]*)<\/title>/), 'Valve Index Stock: Discontinued, Remaining Parts by Country');
  assert.equal(pick(html, /<meta name="description" content="([^"]*)"/), 'The Valve Index is discontinued. See which headsets, controllers, base stations and parts Steam still has in each of 31 countries, while supplies last.');
  assert.equal(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/), 'Valve Index stock and availability by country');
  const body = text(html);
  assert.match(body, /Valve Index is no longer being produced/);
  assert.match(body, /while supplies last/);
  assert.match(body, /Valve Index page on Steam \. These notes were last compared with Valve's page on 26 Oct 2026/);
  assert.match(body, /Is the Valve Index discontinued\?/);
  assert.match(body, /Will Valve restock the Valve Index\?/);
  assert.match(body, /At least one part in stock in 1 of 31 Steam countries/);
  assert.doesNotMatch(body, /Stock can come back at any time/);
});

test('alerts for the Index name how many parts are in stock', () => {
  const msg = formatMessage([{ productName: 'Valve Index', regionName: 'United States', url: 'https://steamhardwarestock.com/valve-index/us', status: 'in_stock', statusLabel: '4 of 9 parts in stock', previous: 'out_of_stock' }]);
  assert.match(msg, /Valve Index in United States: Out of stock → 4 of 9 parts in stock/);
});

test('the home page links to the Index page and it is in the sitemap', () => {
  assert.match(read('index.html'), new RegExp(`<a href="${SLUG}">`));
  assert.doesNotMatch(read('index.html'), /discontinued/i);
  const xml = read('sitemap.xml');
  assert.match(xml, new RegExp(`<loc>https://steamhardwarestock.com${SLUG}</loc>`));
  assert.match(xml, new RegExp(`<loc>https://steamhardwarestock.com${SLUG}/us</loc>`));
});
