import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProductPage, renderRegionPage } from '../lib/landing.mjs';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';

// Trimmed from the live status.json and history of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const product = (id) => PRODUCTS.find((p) => p.id === id);
const region = (cc) => REGIONS.find((r) => r.code === cc);
const section = (html, label) => html.match(new RegExp(`<section class="results-section" aria-labelledby="${label}">[\\s\\S]*?</section>`))?.[0] || '';
const cards = (html) => [...html.matchAll(/<a class="pcard" href="([^"]+)">[\s\S]*?<span class="nm">([^<]*)<\/span>([\s\S]*?)<\/a>/g)]
  .map(([, href, name, rest]) => ({ href, name, badge: rest.match(/<span class="badge ([a-z_]+)">([^<]*)<\/span>/)?.slice(1) || null, why: rest.match(/<span class="why">([^<]*)<\/span>/)?.[1] || null }));

test('the Steam Deck page lists hardware often checked with it, with live status', () => {
  const html = renderProductPage(product('steam-deck'), fx.history, fx.status, {});
  const rel = section(html, 'related-title');
  assert.match(rel, /<h2 id="related-title">Often checked with the Steam Deck<\/h2>/);
  assert.deepEqual(cards(rel), [
    { href: '/steam-dock', name: 'Steam Deck Dock', badge: ['out_of_stock', 'Out of stock in all 30'], why: 'The official dock' },
    { href: '/steam-deck-refurbished', name: 'Steam Deck (Refurbished)', badge: ['out_of_stock', 'Out of stock in all 30'], why: 'Cheaper, when Valve has it' },
    { href: '/steam-hardware-power-supply', name: 'Steam Hardware Power Supply Unit', badge: ['in_stock', 'In stock in 5 of 31'], why: 'Spare 45W charger' },
    { href: '/steam-deck-black-friday', name: 'Steam Deck Black Friday', badge: null, why: 'Stock and prices for Black Friday and the Winter Sale' }
  ]);
  assert.ok(html.indexOf('id="related-title"') < html.indexOf('id="faq-title"'), 'above the questions');
});

test('pages without a related list do not get the row', () => {
  const html = renderProductPage(product('steam-frame'), fx.history, fx.status, {});
  assert.doesNotMatch(html, /related-title/);
});

test('country pages show other Valve hardware as status cards for that country', () => {
  const html = renderRegionPage(product('steam-controller'), region('US'), fx.history, fx.status, {});
  const others = section(html, 'others-title');
  assert.match(others, /<h2 id="others-title">Other Valve hardware in United States<\/h2>/);
  assert.doesNotMatch(others, /<li>/);
  assert.deepEqual(cards(others).map(({ href, badge }) => [href, ...badge]), [
    ['/steam-deck/us', 'in_stock', 'In stock'],
    ['/steam-dock/us', 'out_of_stock', 'Out of stock'],
    ['/steam-deck-refurbished/us', 'out_of_stock', 'Out of stock'],
    ['/steam-frame/us', 'waitlist', 'Waitlist'],
    ['/steam-frame-ergonomic-kit/us', 'out_of_stock', 'Out of stock'],
    ['/steam-frame-replacement-kit/us', 'out_of_stock', 'Out of stock'],
    ['/steam-hardware-power-supply/us', 'in_stock', 'In stock'],
    ['/valve-index/us', 'in_stock', '4 of 9 parts in stock'],
    ['/steam-machine/us', 'waitlist', 'Waitlist']
  ]);
  assert.ok(others.includes(`<img src="${product('steam-deck').icon}" alt="" width="56" height="36" loading="lazy">`), 'icon');
});

test('Komodo and not-sold products get a neutral card', () => {
  const html = renderRegionPage(product('steam-deck'), region('JP'), fx.history, fx.status, {});
  const byHref = Object.fromEntries(cards(section(html, 'others-title')).map((c) => [c.href, c.badge]));
  assert.deepEqual(byHref['/steam-controller/jp'], ['unknown', 'Sold via Komodo']);
  assert.deepEqual(byHref['/steam-dock/jp'], ['unknown', 'Not sold here']);
});

test('a failed check reads as such, not as out of stock', () => {
  const status = structuredClone(fx.status);
  status.products['steam-deck'].US.status = 'error';
  const html = renderRegionPage(product('steam-controller'), region('US'), fx.history, status, {});
  const deck = cards(section(html, 'others-title')).find((c) => c.href === '/steam-deck/us');
  assert.equal(deck.badge[0], 'error');
});
