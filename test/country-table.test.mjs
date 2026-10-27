import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProductPage } from '../lib/landing.mjs';
import { PRODUCTS, REGIONS, VALVE_SELLS } from '../lib/products.mjs';

// Trimmed from the live status.json, history and prices of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const page = (id, status = fx.status) => renderProductPage(byId[id], fx.history, status, { prices: fx.prices });
const section = (html) => html.match(/<section class="results-section ctable-section"[\s\S]*?<\/section>/)?.[0] || '';
const table = (html) => section(html).match(/<table class="history-table ctable">[\s\S]*?<\/table>/)?.[0] || '';
const groups = (html) => [...table(html).matchAll(/<tr class="grp"><th colspan="4" scope="colgroup">([^<]*)<\/th><\/tr>/g)].map((m) => m[1]);
const rowCodes = (html) => [...table(html).matchAll(/<tr data-cc="([A-Z]{2})">/g)].map((m) => m[1]);
const row = (html, cc) => table(html).match(new RegExp(`<tr data-cc="${cc}">[\\s\\S]*?</tr>`))?.[0] || '';
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('countries that sell the product come first, out of stock then in stock', () => {
  const html = page('steam-deck');
  assert.deepEqual(groups(html), ['Out of stock (2)', 'In stock (29)']);
  const codes = rowCodes(html);
  assert.deepEqual(codes.slice(0, 2), ['GB', 'IE']);
  assert.equal(codes.length, VALVE_SELLS.length);
  assert.deepEqual(codes.slice(2), VALVE_SELLS.filter((cc) => !['GB', 'IE'].includes(cc)), 'Steam order inside a group');
});

test('waitlist and reservation groups sit between out of stock and in stock', () => {
  assert.deepEqual(groups(page('steam-controller')), ['Waitlist (30)', 'Reservations open (1)']);
  assert.deepEqual(groups(page('steam-frame-ergonomic-kit')), ['Out of stock (30)', 'In stock (1)']);
});

test('each row gives the country name, status, price and a stock date', () => {
  const html = page('steam-deck');
  assert.match(text(row(html, 'GB')), /^United Kingdom Out of stock from £649\.00 Last in stock 17 Sept? 2026$/);
  assert.match(row(html, 'GB'), /<a href="\/steam-deck\/gb">United Kingdom<\/a>/);
  assert.match(text(row(html, 'US')), /^United States In stock from \$789\.00 In stock since 26 Oct 2026$/);
  assert.match(text(row(html, 'AU')), /In stock since 28 Sept? 2026$/);
  assert.match(row(html, 'US'), /<td class="ls">In stock since <time datetime="2026-10-26T11:20:40.391Z">/);
});

test('a country with no recorded stock says so', () => {
  const html = page('steam-frame');
  assert.match(text(row(html, 'US')), /Waitlist .*No stock recorded$/);
});

test('one checked line replaces the time on every row', () => {
  const html = page('steam-deck');
  assert.match(section(html), /<p class="checked-line">All 31 countries were checked together <time class="checked-ago" datetime="2026-10-27T09:20:40.433Z" title="Tue, 27 Oct 2026 09:20:40 GMT">at 09:20 GMT<\/time>, every 10 minutes\.<\/p>/);
  assert.ok(!table(html).includes('checked-ago'), 'no per-row times');
  assert.ok(!/<th scope="col">Checked<\/th>/.test(html));
  assert.match(table(html), /<th scope="col">Stock history<\/th>/);
});

test('countries where Steam does not sell it fold into a details block', () => {
  const html = page('steam-deck');
  const det = section(html).match(/<details class="notsold">[\s\S]*?<\/details>/)?.[0] || '';
  const others = REGIONS.filter((r) => !VALVE_SELLS.includes(r.code));
  assert.match(det, new RegExp(`<summary>${others.length} other countries where Steam does not sell the Steam Deck</summary>`));
  for (const r of others) assert.ok(det.includes(`<a href="/steam-deck/${r.code.toLowerCase()}">${r.name}</a>`), r.code);
  assert.ok(!table(html).includes('Not sold here'));
  const dock = section(page('steam-dock'));
  assert.match(dock, /<summary>29 other countries where Steam does not sell the Steam Deck Dock<\/summary>/);
  assert.deepEqual(groups(page('steam-dock')), ['Out of stock (30)']);
});

test('before the first check every Steam country is listed as not checked', () => {
  const html = page('steam-deck', null);
  assert.deepEqual(groups(html), [`Not checked yet (${VALVE_SELLS.length})`]);
  assert.ok(!section(html).includes('checked-line'));
});
