import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, REGIONS, VALVE_SELLS } from '../lib/products.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = 'steam-frame-ergonomic-kit';
const FULL = 'Steam Frame Ergonomic Accessories Kit stock in';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const status = p.id === KIT && cc === 'DE' ? 'in_stock' : 'out_of_stock';
      products[p.id][cc] = { status, packages: p.packages.map((pk) => ({ id: pk.id, status })) };
    }
  }
  const dir = tmpDir('shs-ergo-');
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: { version: 1, generatedAt: '2026-10-26T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history: {}, prices: {} }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  return (cc) => {
    const html = readFileSync(path.join(dir, 'd', KIT, `${cc.toLowerCase()}.html`), 'utf8');
    const pick = (re) => decode((html.match(re) || [])[1] || '');
    return { title: pick(/<title>([^<]*)<\/title>/), description: pick(/<meta name="description" content="([^"]*)"/) };
  };
}

const page = build();

test('an ergo kit country page is titled with the full kit name and keeps the stock status in the description', () => {
  const nl = page('NL');
  assert.equal(nl.title, `${FULL} Netherlands`);
  assert.match(nl.description, /out of stock/i);
  const de = page('DE');
  assert.equal(de.title, `${FULL} Germany`);
  assert.match(de.description, /in stock/i);
  assert.doesNotMatch(de.description, /out of stock/i);
});

test('every ergo kit country page uses the full phrase unless the country name is too long for it', () => {
  for (const region of REGIONS) {
    const { title } = page(region.code);
    assert.ok(title.length <= 60, `${region.code}: ${title}`);
    assert.match(title, /^Steam Frame Ergonomic /, `${region.code}: ${title}`);
    assert.ok(title.endsWith(region.name), `${region.code}: ${title}`);
    if (`${FULL} ${region.name}`.length <= 60) assert.equal(title, `${FULL} ${region.name}`);
  }
  assert.equal(page('GB').title, 'Steam Frame Ergonomic Accessories Kit in United Kingdom');
  assert.equal(page('AE').title, 'Steam Frame Ergonomic Kit stock in United Arab Emirates');
});
