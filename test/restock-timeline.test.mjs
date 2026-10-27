import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProductPage } from '../lib/landing.mjs';
import { PRODUCTS } from '../lib/products.mjs';

// Live status.json and stock history of 27 Oct 2026 (Steam Deck events since 1 Sep).
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const deck = PRODUCTS.find((p) => p.id === 'steam-deck');
const html = renderProductPage(deck, fx.history, fx.status, { prices: fx.prices });
const restock = html.match(/<section class="results-section" id="restock"[\s\S]*?<\/section>/)?.[0] || '';
const tl = restock.match(/<div class="tl"[\s\S]*?<\/div>\s*<p class="tl-legend">[\s\S]*?<\/p>/)?.[0] || '';
const rows = [...tl.matchAll(/<span class="tl-name"[^>]*>([\s\S]*?)<\/span>\s*<div class="track"[^>]*>([\s\S]*?)<\/div>/g)]
  .map((m) => ({ name: m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), bars: [...m[2].matchAll(/<i style="left:([\d.]+)%;width:([\d.]+)%" title="([^"]*)"><\/i>/g)].map((b) => ({ left: +b[1], width: +b[2], title: b[3] })) }));
const row = (name) => rows.find((r) => r.name.startsWith(name));

test('a 30-day timeline replaces the recorded restocks list', () => {
  assert.ok(tl, 'timeline present');
  assert.doesNotMatch(restock, /Recorded restocks/);
  assert.match(restock, /<h3>Last 30 days<\/h3>/);
  assert.match(tl, /<div class="axis"><span>27 Sept?<\/span><span>12 Oct<\/span><span>27 Oct<\/span><\/div>/);
});

test('one row per country, EU countries with the same pattern share a row', () => {
  assert.deepEqual(rows.map((r) => r.name), ['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', '26 EU countries (same pattern)']);
  const eu = tl.match(/<span class="tl-name" title="([^"]*)">26 EU countries/)?.[1] || '';
  assert.ok(eu.startsWith('Austria, Belgium') && !eu.includes('Ireland'), eu);
});

test('green bars are the times Steam showed stock, from the history', () => {
  const us = row('United States').bars;
  assert.equal(us.length, 11);
  assert.equal(us[0].title, '29 Sep 23:20 to 1 Oct 04:30 GMT');
  assert.ok(Math.abs(us[0].left - 8.61) < 0.05, `left ${us[0].left}`);
  assert.equal(us.at(-1).title, '26 Oct 11:20 to 27 Oct 09:20 GMT', 'the last bar runs to the last check');
  assert.ok(Math.abs(us.at(-1).left + us.at(-1).width - 100) < 0.05);
  assert.equal(row('Canada').bars.length, 10);
  assert.equal(row('United Kingdom').bars.length, 0);
  assert.equal(row('Ireland').bars.length, 0);
  const au = row('Australia').bars;
  assert.equal(au.length, 1);
  assert.equal(au[0].title, '28 Sep 00:20 to 27 Oct 09:20 GMT');
  assert.equal(row('26 EU countries').bars.length, 4);
});

test('each row ends with the current status', () => {
  assert.equal((tl.match(/<span class="now"><span class="badge in_stock">In stock<\/span><\/span>/g) || []).length, 4);
  assert.equal((tl.match(/<span class="now"><span class="badge out_of_stock">Out of stock<\/span><\/span>/g) || []).length, 2);
});

test('the legend counts restocks and says when stock was last seen', () => {
  const legend = tl.match(/<p class="tl-legend">([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, '');
  assert.match(legend, /United States: 11 restocks, most recently 26 Oct\./);
  assert.match(legend, /26 EU countries: 4 restocks, most recently 26 Oct\./);
  assert.match(legend, /United Kingdom: none, last in stock 17 Sept? 2026\./);
  assert.match(legend, /Australia: 1 restock, most recently 28 Sept?\./);
});

test('no history means no bars and a plain note', () => {
  const empty = renderProductPage(deck, {}, fx.status, { prices: fx.prices });
  const sec = empty.match(/<section class="results-section" id="restock"[\s\S]*?<\/section>/)?.[0] || '';
  assert.doesNotMatch(sec, /<div class="tl"/);
  assert.match(sec, /No stock history has been recorded yet\./);
});
