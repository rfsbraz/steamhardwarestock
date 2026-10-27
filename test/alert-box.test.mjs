import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as landing from '../lib/landing.mjs';
const { renderProductPage } = landing;
const pickCountry = (...a) => landing.pickCountry(...a);
import { PRODUCTS } from '../lib/products.mjs';

// Trimmed from the live status.json, history and prices of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const page = (id) => renderProductPage(byId[id], fx.history, fx.status, { prices: fx.prices });
const box = (html) => html.match(/<section class="alert-box"[\s\S]*?<\/section>/)?.[0] || '';

test('every product page has the alert box right under the title', () => {
  for (const p of PRODUCTS) {
    const html = page(p.id);
    const header = html.indexOf('</header>');
    const at = html.indexOf('<section class="alert-box"');
    assert.ok(at > header, `${p.id}: alert box after the title`);
    assert.ok(at < html.indexOf('<p class="intro">', header), `${p.id}: alert box before the intro`);
  }
});

test('the form opens the tracker with the product and the chosen country', () => {
  const b = box(page('steam-dock'));
  assert.match(b, /<form action="\/" method="get"/);
  assert.match(b, /<input type="hidden" name="p" value="steam-dock">/);
  assert.match(b, /<select name="r"/);
  assert.match(b, /<option value="">Choose your country<\/option>/);
  assert.match(b, /<button type="submit">Alert me<\/button>/);
});

test('the select lists only the countries where Steam sells the product', () => {
  const codes = (html) => [...box(html).matchAll(/<option value="([A-Z]{2})"/g)].map((m) => m[1]);
  const dock = codes(page('steam-dock'));
  assert.equal(dock.length, 30);
  assert.ok(!dock.includes('AU'), 'Steam does not sell the dock in Australia');
  assert.ok(dock.includes('PT') && dock.includes('GB'));
  assert.equal(codes(page('steam-deck')).length, 31);
});

test('the heading follows what Steam shows', () => {
  assert.match(box(page('steam-dock')), /<h2[^>]*>Get an alert when the Steam Deck Dock is back<\/h2>/);
  assert.match(box(page('steam-deck')), /<h2[^>]*>Get a Steam Deck stock alert for your country<\/h2>/);
  assert.match(box(page('steam-controller')), /<h2[^>]*>Get an alert when Steam Controller reservations open<\/h2>/);
});

test('the RSS feed is a visible link in the box', () => {
  assert.match(box(page('steam-deck')), /<a href="\/rss\.xml"[^>]*>Or follow the RSS feed<\/a>/);
});

test('the country is the saved one, else the browser region when Steam sells there', () => {
  const codes = ['GB', 'PT', 'US'];
  assert.equal(pickCountry('GB', ['pt-PT'], codes), 'GB');
  assert.equal(pickCountry(null, ['pt-PT', 'en'], codes), 'PT');
  assert.equal(pickCountry(null, ['en', 'en-US'], codes), 'US');
  assert.equal(pickCountry('XX', ['ja-JP'], codes), '');
  assert.equal(pickCountry(null, [], codes), '');
});
