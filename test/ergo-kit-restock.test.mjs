import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1'));

// Steam countries outside the EU, same split the dock page uses.
const NOT_EU = ['US', 'CA', 'GB', 'AU'];
const EU = VALVE_SELLS.filter((cc) => !NOT_EU.includes(cc));
const KIT = 'steam-frame-ergonomic-kit';

const last = (ts) => ({ lastInStock: ts, events: [{ ts, status: 'in_stock' }] });

function fixtureHistory({ usCa, eu, gb, au } = {}) {
  const history = {};
  if (usCa) {
    history[`${KIT}:US`] = last(usCa);
    history[`${KIT}:CA`] = last(usCa);
  }
  if (eu) {
    for (const cc of EU) history[`${KIT}:${cc}`] = last(eu);
  }
  if (gb) history[`${KIT}:GB`] = last(gb);
  if (au) history[`${KIT}:AU`] = last(au);
  return history;
}

function build(history = {}) {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const status = 'out_of_stock';
      products[p.id][cc] = { status, packages: p.packages.map((pk) => ({ id: pk.id, status })) };
    }
  }
  const dir = tmpDir('shs-ergo-restock-');
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({
    status: { version: 1, generatedAt: '2026-11-23T08:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products },
    history,
    prices: {}
  }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  const page = (file) => readFileSync(path.join(dir, 'd', file), 'utf8');
  return { kit: page('steam-frame-ergonomic-kit.html'), frame: page('steam-frame.html'), dock: page('steam-dock.html') };
}

const restockSection = (html) => {
  const body = html.slice(html.indexOf('<body'));
  const m = body.match(/<section[^>]*>\s*<h2[^>]*>When will it be back in stock\?<\/h2>[\s\S]*?<\/section>/);
  return m ? { html: m[0], text: text(m[0]), start: body.indexOf(m[0]) } : null;
};

test('the kit page answers "when will it be back in stock?" from stored restock dates, before the country list', () => {
  const html = build(fixtureHistory({
    usCa: '2026-11-20T12:00:00.000Z',
    eu: '2026-11-12T08:00:00.000Z',
    gb: '2026-11-12T08:00:00.000Z',
    au: '2026-11-08T00:00:00.000Z'
  })).kit;
  const body = html.slice(html.indexOf('<body'));
  const section = restockSection(html);
  assert.ok(section, 'expected an h2 "When will it be back in stock?" section');
  assert.match(section.text, /Valve does not announce restocks in advance/);
  assert.match(section.text, /United States/);
  assert.match(section.text, /Canada/);
  assert.match(section.text, /20 Nov 2026/);
  assert.match(section.text, /United Kingdom/);
  assert.match(section.text, /\bEU\b/);
  assert.match(section.text, /12 Nov 2026/);
  assert.match(section.text, /Australia/);
  assert.match(section.text, /8 Nov 2026/);
  // Dates must come from history, not the 16 Nov / 10 Nov fallback.
  assert.doesNotMatch(section.text, /16 Nov 2026/);
  assert.doesNotMatch(section.text, /10 Nov 2026/);
  assert.match(section.html, /<time datetime="2026-11-20T12:00:00\.000Z">20 Nov 2026<\/time>/);
  assert.match(section.html, /href="\/steam-frame-ergonomic-kit\/us"/);
  assert.match(section.html, /href="\/steam-frame-ergonomic-kit\/ca"/);
  assert.ok(
    section.start < body.indexOf('id="countries-title"'),
    'the restock heading must come before the country list'
  );
});

test('with no stored restock history, the kit page uses the dated 16 Nov / 10 Nov constant', () => {
  const section = restockSection(build({}).kit);
  assert.ok(section, 'expected an h2 "When will it be back in stock?" section');
  assert.match(section.text, /United States/);
  assert.match(section.text, /Canada/);
  assert.match(section.text, /16 Nov 2026/);
  assert.match(section.text, /\bEU\b/);
  assert.match(section.text, /10 Nov 2026/);
  assert.doesNotMatch(section.text, /Australia/);
});

test('the Frame and Dock pages do not get the kit restock heading', () => {
  const pages = build(fixtureHistory({ usCa: '2026-11-20T12:00:00.000Z' }));
  assert.equal(restockSection(pages.frame), null);
  assert.equal(restockSection(pages.dock), null);
});
