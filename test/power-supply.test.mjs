import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = '/steam-hardware-power-supply';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));

function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) products[p.id][cc] = { status: 'out_of_stock', packages: p.packages.map((pk) => ({ id: pk.id, status: 'out_of_stock' })) };
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-psu-'));
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

test('the Steam Hardware Power Supply Unit is tracked by its Steam package', () => {
  const psu = PRODUCTS.find((p) => p.id === 'steam-hardware-power-supply');
  assert.ok(psu, 'product missing');
  assert.equal(psu.name, 'Steam Hardware Power Supply Unit');
  assert.deepEqual(psu.packageIds, [1727369]);
  assert.deepEqual(psu.packages.map((p) => [p.id, p.priceUsd]), [[1727369, 29]]);
  assert.equal(psu.steamPath, '/app/4978480/Steam_Hardware_Power_Supply_Unit/');
});

test('the power supply page has the round 1 title, description and H1', () => {
  const html = read('steam-hardware-power-supply.html');
  assert.equal(pick(html, /<title>([^<]*)<\/title>/), 'Steam Hardware Power Supply Restock by Country');
  assert.equal(pick(html, /<meta name="description" content="([^"]*)"/), 'Is the Steam Hardware Power Supply in stock? The Steam Frame ships without one. Live stock and prices in 31 Steam countries, plus a free restock alert.');
  assert.equal(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/), 'Steam Hardware Power Supply Unit stock and availability by country');
  assert.equal(pick(read('steam-hardware-power-supply/de.html'), /<title>([^<]*)<\/title>/), 'Steam Power Supply Stock in Germany: Out of stock');
});

test('the page answers the charger questions and keeps the purchase rule unconfirmed', () => {
  const body = text(read('steam-hardware-power-supply.html'));
  assert.match(body, /Power Supply not included/);
  assert.match(body, /45W/);
  assert.match(body, /Power Supply Unit page on Steam , checked 26 Oct 2026/);
  assert.match(body, /Steam Deck charger/);
  assert.match(body, /as reported on r\/SteamFrame/);
  assert.match(body, /after you order a Frame/);
  assert.match(body, /Not confirmed\..*unverified/);
});

test('nothing calls the power supply discontinued', () => {
  for (const file of ['steam-hardware-power-supply.html', 'steam-hardware-power-supply/us.html', 'steam-hardware-power-supply/de.html', 'steam-frame.html', 'steam-deck.html', 'index.html']) {
    assert.doesNotMatch(read(file), /discontinued/i, file);
  }
});

test('the Frame, Deck and home pages link to the power supply page', () => {
  for (const file of ['steam-frame.html', 'steam-deck.html', 'index.html']) {
    assert.match(read(file), new RegExp(`<a href="${SLUG}">`), file);
  }
  const frame = read('steam-frame.html');
  const at = frame.indexOf(`href="${SLUG}"`);
  assert.ok(at > frame.indexOf('id="countries-title"') && at < frame.indexOf('aria-label="Per-country stock"'), 'Frame link sits in the countries and prices section');
});

test('the power supply page and its country pages are in the sitemap', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, new RegExp(`<loc>https://steamhardwarestock.com${SLUG}</loc>`));
  assert.match(xml, new RegExp(`<loc>https://steamhardwarestock.com${SLUG}/de</loc>`));
});
