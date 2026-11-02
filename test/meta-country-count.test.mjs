import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOT_IN_AU = new Set(['steam-frame-ergonomic-kit', 'steam-dock', 'steam-deck-refurbished']);
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const status = NOT_IN_AU.has(p.id) && cc === 'AU' ? 'unavailable_in_region' : 'out_of_stock';
      products[p.id][cc] = { status, packages: p.packages.map((pk) => ({ id: pk.id, status })) };
    }
  }
  const dir = tmpDir('shs-meta-count-');
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: { version: 1, generatedAt: '2026-11-02T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history: {}, prices: {} }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  return (page) => {
    const html = readFileSync(path.join(dir, 'd', `${page}.html`), 'utf8');
    return decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  };
}

const description = build();
const listed = VALVE_SELLS.length - 1;

test('a product page meta counts only the Steam countries that list the product', () => {
  const meta = description('steam-frame-ergonomic-kit');
  assert.match(meta, new RegExp(`In stock in 0 of ${listed} Steam countries`), meta);
});

test('a country page where Steam does not sell points to the countries that list the product', () => {
  for (const id of ['steam-dock', 'steam-deck-refurbished']) {
    const meta = description(`${id}/br`);
    assert.match(meta, new RegExp(`See the ${listed} countries where Valve sells it on Steam`), `${id}/br: ${meta}`);
  }
  const meta = description('steam-deck/br');
  assert.match(meta, new RegExp(`See the ${VALVE_SELLS.length} countries where Valve sells it on Steam`), `steam-deck/br: ${meta}`);
});
