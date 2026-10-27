import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProductPage } from '../lib/landing.mjs';
import { PRODUCTS } from '../lib/products.mjs';

// Trimmed from the live status.json, history and prices of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const page = (id) => renderProductPage(byId[id], fx.history, fx.status, { prices: fx.prices });
const hero = (html) => html.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] || '';
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const now = (html) => text(html.match(/<div class="hero-now">[\s\S]*?<\/div>\s*(?=<div class="hero-yc"|<\/section>)/)?.[0] || '');
const panel = (html, cc) => html.match(new RegExp(`<div class="yc" data-yc="${cc}"[\\s\\S]*?</div>`))?.[0] || '';

test('every product page has the summary between the intro and the trust strip', () => {
  for (const p of PRODUCTS) {
    const html = page(p.id);
    const at = html.indexOf('<section class="hero"');
    assert.ok(at > html.indexOf('<p class="intro">'), `${p.id}: after the intro`);
    assert.ok(at < html.indexOf('<div class="trust"'), `${p.id}: before the trust strip`);
  }
});

test('the headline counts the countries that list the product', () => {
  assert.match(now(page('steam-deck')), /^Right now ?In stock in 29 of 31 countries/);
  assert.match(now(page('steam-dock')), /^Right now ?Out of stock in all 30 countries/);
  assert.match(now(page('valve-index')), /^Right now ?At least one part in stock in 28 of 31 countries/);
  assert.match(now(page('steam-controller')), /^Right now ?Waitlist in 30 of 31 countries/);
});

test('the bar splits in stock, reservations and the rest', () => {
  const bar = (id) => [...hero(page(id)).matchAll(/<i class="(\w)" style="width:([\d.]+)%"><\/i>/g)].map((m) => `${m[1]}${Math.round(m[2])}`);
  assert.deepEqual(bar('steam-deck'), ['g94', 'a0', 'o6']);
  assert.deepEqual(bar('steam-controller'), ['g0', 'a3', 'o97']);
});

test('countries out of stock are listed with their last in-stock date', () => {
  assert.match(now(page('steam-deck')), /Out of stock: United Kingdom \(last in stock 17 Sept? 2026\), Ireland \(last in stock 17 Sept? 2026\)\./);
  assert.match(now(page('steam-hardware-power-supply')), /and 18 more, see the table below\./);
  assert.match(now(page('steam-dock')), /Last in stock anywhere: United Kingdom, 2 Oct 2026\./);
  assert.match(now(page('steam-frame-replacement-kit')), /No stock recorded yet\./);
});

test('the controller shows reservations, the order window and the status page', () => {
  const h = hero(page('steam-controller'));
  assert.match(h, /Reservations open:<\/strong> <a href="\/steam-controller\/au">Australia<\/a>\. Everywhere else Steam shows <em>Join waitlist<\/em>\./);
  assert.match(now(page('steam-controller')), /Steam's estimated order window: around January 2027\./);
  assert.match(h, /<a href="\/steam-controller\/status">See the button Steam shows in each country →<\/a>/);
});

test('the your-country panel is prerendered per country and hidden until a country is picked', () => {
  const html = page('steam-deck');
  assert.match(hero(html), /<div class="hero-yc" hidden>/);
  assert.equal([...hero(html).matchAll(/data-yc="[A-Z]{2}"/g)].length, 31);
  const pt = text(panel(html, 'PT'));
  assert.match(pt, /Portugal: In stock/);
  assert.match(pt, /From 779,00€ on Steam\. In stock since 26 Oct 2026\./);
  const gb = text(panel(html, 'GB'));
  assert.match(gb, /United Kingdom: Out of stock/);
  assert.match(gb, /Last in stock 17 Sept? 2026\./);
  assert.match(panel(html, 'PT'), /href="\/steam-deck\/pt">Portugal details<\/a>/);
  assert.match(panel(html, 'PT'), /href="\/\?p=steam-deck&amp;r=PT"/);
});

test('the controller panel gives the order window and delivery time', () => {
  const pt = text(panel(page('steam-controller'), 'PT'));
  assert.match(pt, /Portugal: Waitlist/);
  assert.match(pt, /Order window around January 2027\. Delivery 6 to 10 business days once you can order\./);
  assert.match(pt, /Alert me when reservations open/);
});

test('the country script shows the panel for the picked country', () => {
  const html = page('steam-deck');
  assert.match(html, /data-yc/);
  assert.match(html, /querySelectorAll\('\[data-yc\]'\)/);
});
