import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS } from '../lib/products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Round 1 CTR test copy (R1-CTR and R1-HOME), word for word from the
// experiment log. The descriptions are static so the test reads one variant.
const COPY = {
  '/': {
    title: 'Steam Hardware Tracker: Steam Deck Stock, Frame and More',
    description: 'Free Steam hardware tracker. Check Steam Deck stock, plus Frame, Machine, Controller and Dock, in 31 countries every 10 minutes, with a restock alert.'
  },
  '/steam-frame': {
    title: 'Steam Frame Availability by Country: Stock and Waitlist',
    description: 'Is the Steam Frame in stock? See where Steam sells it, plus the waitlist or reservation status and price in each of 31 countries. Free restock alert.'
  },
  '/steam-dock': {
    title: 'Steam Deck Dock Restock: Out of Stock or Discontinued?',
    description: 'Is the Steam Deck Docking Station out of stock? Live stock in 31 Steam countries, the date it was last in stock in each, and a free alert when it restocks.'
  },
  '/steam-machine': {
    title: 'Steam Machine Stock Tracker: Available Countries',
    description: 'Is the Steam Machine in stock? Track the waitlist and reservation status in all 31 countries Steam sells it, with local prices. Free restock alert.'
  },
  '/steam-deck': {
    title: 'Steam Deck Stock Tracker: Available Countries and Restocks',
    description: 'Where can you buy a Steam Deck right now? Live OLED and LCD stock in the 31 countries Steam sells it, every recorded restock, and a free restock alert.'
  },
  '/steam-controller': {
    title: 'Steam Controller Tracker: Stock and Reservations by Region',
    description: 'Steam Controller tracker: reservation, waitlist and stock status in every region Steam sells it, with the last in-stock date per country. Free alert.'
  }
};

const LIVE_COUNT = /In stock in \d+ of \d+ Steam countries at the last check\./;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

function build() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) products[p.id][cc] = { status: cc === 'US' ? 'in_stock' : 'out_of_stock', packages: p.packages.map((pk) => ({ id: pk.id, status: 'out_of_stock' })) };
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-copy-'));
  writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status: { version: 1, generatedAt: '2026-10-26T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products }, history: {}, prices: {} }));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '' },
    stdio: 'pipe'
  });
  return (rel) => {
    const html = readFileSync(path.join(dir, 'd', rel === '/' ? 'index.html' : `${rel.slice(1)}.html`), 'utf8');
    const pick = (re) => decode((html.match(re) || [])[1] || '');
    return {
      html,
      title: pick(/<title>([^<]*)<\/title>/),
      description: pick(/<meta name="description" content="([^"]*)"/),
      h1: pick(/<h1[^>]*>([\s\S]*?)<\/h1>/)
    };
  };
}

const page = build();

test('round 1 pages carry the experiment title and description', () => {
  for (const [rel, copy] of Object.entries(COPY)) {
    const p = page(rel);
    assert.equal(p.title, copy.title, `${rel} title`);
    assert.equal(p.description, copy.description, `${rel} description`);
  }
});

test('round 1 descriptions drop the live in-stock count, other pages keep it', () => {
  for (const rel of Object.keys(COPY)) assert.doesNotMatch(page(rel).description, LIVE_COUNT, rel);
  for (const rel of ['/steam-deck-refurbished', '/steam-frame-ergonomic-kit']) assert.match(page(rel).description, LIVE_COUNT, rel);
});

test('round 1 leaves H1, body counts and country titles as they were', () => {
  assert.equal(page('/steam-frame').h1, 'Steam Frame stock and availability by country');
  assert.equal(page('/steam-dock').h1, 'Steam Deck Dock stock and availability by country');
  assert.match(page('/').h1, /^Steam Hardware Tracker: Stock and Reservation Status in \d+ Countries$/);
  for (const rel of Object.keys(COPY).filter((r) => r !== '/')) assert.match(page(rel).html, /In stock in <strong>\d+<\/strong> of \d+ Steam countries at the last check\./, `${rel} body`);
  assert.equal(page('/steam-frame/de').title, 'Steam Frame Stock in Germany: Out of stock');
});
