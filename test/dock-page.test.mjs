import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1'));

// The dock as Steam showed it on 26 Oct 2026: out of stock everywhere, not
// sold in Australia, last in stock in the UK and Ireland on 2 Oct.
function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const status = p.id === 'steam-dock' && cc === 'AU' ? 'unavailable_in_region' : 'out_of_stock';
      products[p.id][cc] = { status, packages: p.packages.map((pk) => ({ id: pk.id, status })) };
    }
  }
  const last = (ts) => ({ lastInStock: ts, events: [{ ts, status: 'in_stock' }] });
  const history = {
    'steam-dock:US': last('2026-07-01T17:00:16.428Z'),
    'steam-dock:CA': last('2026-07-06T20:20:07.872Z'),
    'steam-dock:GB': last('2026-10-02T07:50:07.459Z'),
    'steam-dock:IE': last('2026-10-02T07:50:07.459Z')
  };
  const prices = { 761892: {
    US: { amount: 79, currency: 'USD', formatted: '$79.00' },
    DE: { amount: 89, currency: 'EUR', formatted: '89,--€' },
    FR: { amount: 89, currency: 'EUR', formatted: '89,--€' },
    PL: { amount: 429, currency: 'PLN', formatted: '429,00zł' }
  } };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-dock-'));
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: { version: 1, generatedAt: '2026-10-26T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history, prices }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  return readFileSync(path.join(dir, 'd', 'steam-dock.html'), 'utf8');
}

const html = build();
const body = html.slice(html.indexOf('<body'));
const section = (id) => text((body.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`)) || [''])[0]);

test('the dock title asks the restock and discontinued questions', () => {
  assert.equal(decode(html.match(/<title>([^<]*)<\/title>/)[1]), 'Steam Deck Dock Restock: Out of Stock or Discontinued?');
});

test('the lead answers "is it discontinued?" before the country list', () => {
  const lead = section('dock-status');
  assert.match(lead, /Is the Steam Deck Dock discontinued\?/);
  assert.match(lead, /Valve has not said so/);
  assert.match(lead, /Steam still lists it in 30 countries/);
  assert.match(lead, /out of stock in all of them at the last check/);
  assert.ok(body.indexOf('id="dock-status"') < body.indexOf('id="countries-title"'), 'lead must come before the country list');
});

test('the page never says the dock is discontinued', () => {
  // "Discontinued" may only appear as a question.
  assert.doesNotMatch(text(body), /discontinued(?!\?)/i);
});

test('last in stock dates are listed above the fold, newest first', () => {
  const lead = section('dock-status');
  assert.match(lead, /Last in stock: United Kingdom 2 Oct 2026, Ireland 2 Oct 2026, Canada 6 Jul 2026, United States 1 Jul 2026\./);
  assert.match(lead, /No stock recorded in the other 26 countries\./);
});

test('a Europe section gives the EU countries, price and last EU stock', () => {
  const eu = section('dock-europe');
  assert.match(eu, /Steam Deck Dock in Europe/);
  assert.match(eu, /Steam sells the Steam Deck Dock in 27 EU countries/);
  assert.match(eu, /89,--€/);
  assert.match(eu, /429,00zł in Poland/);
  assert.match(eu, /In stock in 0 of 27 at the last check/);
  assert.match(eu, /Last in stock in the EU: Ireland, 2 Oct 2026\./);
});
