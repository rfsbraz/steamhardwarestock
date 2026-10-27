import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Affiliate from '../public/affiliate.js';
import { affiliateParts } from '../lib/landing.mjs';

const file = JSON.parse(readFileSync(new URL('../affiliate.config.json', import.meta.url), 'utf8'));
const deal = { handle: 'steam-deck-docking-station', title: '5-in-1 Docking Station', url: 'https://jsaux.com/products/steam-deck-docking-station', price: 2999, was: 3999, image: '/deals/steam-deck-docking-station.webp' };
const DEALS = { checkedAt: '2026-10-27T06:00:00.000Z', pages: { 'steam-deck': [deal] } };
const HALLOWEEN = { label: 'JSAUX Halloween Sale, until 5 Nov', endsAt: '2026-11-06T08:00:00Z', coupon: '' };
const cfg = (promo) => ({ ...Affiliate.resolveConfig({ jsaux: { refId: 'ref123', promo } }, {}), deals: DEALS });
const BEFORE = Date.parse('2026-10-27T12:00:00Z');
const AFTER = Date.parse('2026-11-06T08:00:01Z');

test('the committed config starts with the Halloween promo and an empty coupon slot', () => {
  assert.deepEqual(file.jsaux.promo, HALLOWEEN);
  assert.deepEqual(Affiliate.resolveConfig(file, {}).jsaux.promo, HALLOWEEN);
});

test('the promo pill shows in the strip head before the end date', () => {
  const html = Affiliate.accessoryBlock('steam-deck', cfg(HALLOWEEN), BEFORE);
  assert.ok(html.includes('<span class="deal-promo" data-ends="2026-11-06T08:00:00.000Z">JSAUX Halloween Sale, until 5 Nov</span><span class="deal-ad"'));
});

test('the promo pill is left out once the end date has passed', () => {
  const html = Affiliate.accessoryBlock('steam-deck', cfg(HALLOWEEN), AFTER);
  assert.match(html, /deal-strip/);
  assert.ok(!html.includes('deal-promo'));
});

test('a coupon code shows in the pill when one is set', () => {
  const html = Affiliate.accessoryBlock('steam-deck', cfg({ ...HALLOWEEN, coupon: 'SHS10' }), BEFORE);
  assert.ok(html.includes('>JSAUX Halloween Sale, until 5 Nov, code <b>SHS10</b></span>'));
});

test('a promo without a label or a valid end date is dropped', () => {
  assert.equal(Affiliate.resolveConfig({ jsaux: { promo: { label: '', endsAt: '2026-11-06T08:00:00Z' } } }, {}).jsaux.promo, undefined);
  assert.equal(Affiliate.resolveConfig({ jsaux: { promo: { label: 'Sale', endsAt: 'soon' } } }, {}).jsaux.promo, undefined);
  assert.equal(Affiliate.resolveConfig({ jsaux: { refId: '' } }, {}).jsaux.promo, undefined);
});

test('pages built before the end date hide the pill in the browser after it', () => {
  const pills = [{ ends: '2026-11-06T08:00:00.000Z', removed: false }, { ends: '2026-12-01T00:00:00.000Z', removed: false }];
  const doc = { querySelectorAll: (sel) => (sel === '.deal-promo[data-ends]' ? pills.map((p) => ({ getAttribute: () => p.ends, remove: () => { p.removed = true; } })) : []), addEventListener() {} };
  Affiliate.hideEndedPromos(doc, BEFORE);
  assert.deepEqual(pills.map((p) => p.removed), [false, false]);
  Affiliate.hideEndedPromos(doc, AFTER);
  assert.deepEqual(pills.map((p) => p.removed), [true, false]);
});

test('landing pages inline the promo check next to the click tracker', () => {
  const { tracker } = affiliateParts('steam-deck', cfg(HALLOWEEN));
  assert.match(tracker, /deal-promo\[data-ends\]/);
  assert.match(tracker, /\(document, Date\.now\(\)\)/);
});

test('the pill is styled as in the mockup', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.deal-promo \{[^}]*background: var\(--amber-bg\)/);
});
