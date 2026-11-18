import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, VALVE_SELLS, productById } from '../lib/products.mjs';
import { renderProductPage } from '../lib/landing.mjs';
import { tmpDir } from './helpers/tmp.mjs';

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
    title: 'Steam Deck Dock Out of Stock: Last Restock Dates by Country',
    description: 'Why is the Steam Deck Dock out of stock? See when it was last in stock in each of the 30 countries Steam sells it, and get a free alert when it is back.'
  },
  '/steam-machine': {
    title: 'Steam Machine Stock Tracker: Available Countries',
    description: 'Is the Steam Machine in stock? Track the waitlist and reservation status in all 31 countries Steam sells it, with local prices. Free restock alert.'
  },
  '/steam-deck': {
    title: 'Is the Steam Deck in Stock? OLED and LCD Stock by Country',
    description: 'Steam Deck OLED and LCD stock in the 31 countries Steam sells it, checked every 10 minutes. In stock in 1 of 31 at the last check. Free restock alert.'
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
  const dir = tmpDir('shs-copy-');
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
  for (const rel of ['/steam-frame-ergonomic-kit']) assert.match(page(rel).description, LIVE_COUNT, rel);
});

test('round 1 leaves H1, body counts and country titles as they were', () => {
  assert.equal(page('/steam-frame').h1, 'Steam Frame stock and availability by country');
  assert.equal(page('/steam-dock').h1, 'Steam Deck Dock stock and availability by country');
  assert.match(page('/').h1, /^Steam Hardware Tracker: Stock and Reservation Status in \d+ Countries$/);
  for (const rel of Object.keys(COPY).filter((r) => r !== '/')) assert.match(page(rel).html, /In stock in <strong>\d+<\/strong> of \d+ Steam countries at the last check\./, `${rel} body`);
  assert.equal(page('/steam-frame/de').title, 'Steam Frame Stock in Germany: Out of stock');
});

test('the Steam Deck main page uses the live sold-in title and description', () => {
  const p = page('/steam-deck');
  assert.equal(p.title, COPY['/steam-deck'].title);
  assert.equal(p.description, COPY['/steam-deck'].description);
  assert.equal(p.h1, 'Steam Deck stock and availability by country');
});

test('a Steam Deck country page title did not change', () => {
  assert.equal(page('/steam-deck/de').title, 'Steam Deck Stock in Germany: Out of stock');
});

test('the Steam Deck description fills the sold-in and in-stock counts', () => {
  const product = productById('steam-deck');
  const products = { 'steam-deck': {} };
  for (const cc of VALVE_SELLS) {
    const status = cc === 'AU' ? 'unavailable_in_region' : (['US', 'GB'].includes(cc) ? 'in_stock' : 'out_of_stock');
    products['steam-deck'][cc] = { status, packages: product.packages.map((pk) => ({ id: pk.id, status })) };
  }
  const doc = { version: 1, generatedAt: '2026-11-16T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products };
  const html = renderProductPage(product, {}, doc, { prices: {} });
  const description = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  const sold = VALVE_SELLS.length - 1;
  assert.equal(
    description,
    `Steam Deck OLED and LCD stock in the ${sold} countries Steam sells it, checked every 10 minutes. In stock in 2 of ${sold} at the last check. Free restock alert.`
  );
});

test('the dock title and meta use the 30-country restock-dates copy, without discontinued', () => {
  const p = page('/steam-dock');
  assert.equal(p.title, COPY['/steam-dock'].title);
  assert.equal(p.description, COPY['/steam-dock'].description);
  assert.equal(p.h1, 'Steam Deck Dock stock and availability by country');
  assert.doesNotMatch(`${p.title} ${p.description}`, /discontinued/i);
  for (const [attr, key, want] of [['property', 'og:title', p.title], ['property', 'og:description', p.description]]) {
    const m = p.html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
    if (m) assert.equal(decode(m[1]), want, key);
  }
});

// Round 2 experiment on the refurbished Deck page: title and description
// only. The H1, the body and the country pages are the control.
test('round 2 refurbished page carries the experiment title and description', () => {
  const p = page('/steam-deck-refurbished');
  const title = 'Steam Deck Refurbished Restock Tracker: Stock by Country';
  const description = 'Is the refurbished Steam Deck back in stock? Valve Certified units tracked every 10 minutes in the 30 countries Steam sells them. Free restock alert.';
  assert.equal(p.title, title);
  assert.equal(p.description, description);
  assert.doesNotMatch(p.description, LIVE_COUNT);
  for (const [attr, key, want] of [['property', 'og:title', title], ['property', 'og:description', description], ['name', 'twitter:title', title], ['name', 'twitter:description', description]]) {
    const m = p.html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
    if (m) assert.equal(decode(m[1]), want, key);
  }
});

test('round 2 leaves the refurbished H1, body and country pages as they were', () => {
  const p = page('/steam-deck-refurbished');
  assert.equal(p.h1, 'Steam Deck (Refurbished) stock and availability by country');
  assert.match(p.html, /In stock in <strong>\d+<\/strong> of \d+ Steam countries at the last check\./);
  const de = page('/steam-deck-refurbished/de');
  assert.equal(de.title, 'Refurbished Steam Deck Stock in Germany: Out of stock');
  assert.equal(de.description, 'Refurbished Steam Deck in Germany: out of stock on the Steam Store. No restock recorded yet. Stock is checked every 10 minutes. Get a free restock alert.');
  assert.equal(de.h1, 'Steam Deck (Refurbished) stock in Germany');
});
