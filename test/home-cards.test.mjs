import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prerenderHome } from '../scripts/prerender.mjs';
import { PRODUCTS } from '../lib/products.mjs';

// Trimmed from the live status.json and history of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const source = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const home = (status = fx.status) => prerenderHome(source, status, fx.history);
const cards = (html) => html.match(/<div class="pcards">[\s\S]*?<\/div><\/section>/)?.[0] || '';
const card = (html, id) => cards(html).match(new RegExp(`<a class="pcard" href="/${id}">[\\s\\S]*?</a>`))?.[0] || '';
const badge = (html, id) => card(html, id).match(/<span class="badge ([a-z_]+)">([^<]*)<\/span>/)?.slice(1) || [];

test('every product gets a linked card at the top of the homepage', () => {
  const html = home();
  const list = cards(html);
  assert.ok(list, 'cards rendered');
  assert.deepEqual([...list.matchAll(/<a class="pcard" href="\/([a-z0-9-]+)">/g)].map((m) => m[1]), PRODUCTS.map((p) => p.id));
  for (const p of PRODUCTS) {
    const c = card(html, p.id);
    assert.ok(c.includes(`<span class="nm">${p.name.replace(/&/g, '&amp;')}</span>`), `${p.id}: name`);
    assert.ok(c.includes(`<img src="${p.icon}" alt="" width="56" height="36" loading="lazy">`), `${p.id}: icon`);
  }
  const at = html.indexOf('<section class="pcards-wrap"');
  assert.ok(at > html.indexOf('</header>') && at < html.indexOf('<p class="intro">'), 'between the header and the watch form');
});

test('each card gives the state from the latest check', () => {
  const html = home();
  assert.deepEqual(badge(html, 'steam-controller'), ['reservation_open', 'Waitlist in 30, reservations in 1 of 31']);
  assert.deepEqual(badge(html, 'steam-deck'), ['in_stock', 'In stock in 29 of 31']);
  assert.deepEqual(badge(html, 'steam-dock'), ['out_of_stock', 'Out of stock in all 30']);
  assert.deepEqual(badge(html, 'steam-frame'), ['waitlist', 'Waitlist in 31 of 31']);
  assert.deepEqual(badge(html, 'steam-frame-ergonomic-kit'), ['in_stock', 'In stock in 1 of 31']);
  assert.deepEqual(badge(html, 'steam-frame-replacement-kit'), ['out_of_stock', 'Out of stock in all 31']);
  assert.deepEqual(badge(html, 'valve-index'), ['in_stock', 'In stock in 28 of 31']);
});

test('a country with a failed check is not counted as out of stock', () => {
  const status = structuredClone(fx.status);
  status.products['steam-frame-replacement-kit'].US.status = 'error';
  assert.deepEqual(badge(home(status), 'steam-frame-replacement-kit'), ['out_of_stock', 'Out of stock in 30 of 31']);
});

test('before the first check the cards say so', () => {
  const html = home(null);
  assert.deepEqual(badge(html, 'steam-deck'), ['unknown', 'Not checked yet']);
});

test('the long intro moves to an About this tracker section above the footer', () => {
  const html = home();
  const at = html.indexOf('<section class="home-intro"');
  assert.ok(at > html.indexOf('aria-label="Browse by product"'), 'after the product list');
  assert.ok(at < html.indexOf('<footer'), 'before the footer');
  assert.match(html, /<section class="home-intro" aria-label="About this tracker">\s*<h2>About this tracker<\/h2>/);
  assert.match(html, /you care about in the watch form above and press Start watching/, 'the form is above it now');
});
