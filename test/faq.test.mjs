import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProductPage, renderRegionPage } from '../lib/landing.mjs';
import { productFaq, regionFaq } from '../lib/faq.mjs';
import { PRODUCTS, REGIONS, VALVE_SELLS, productById, regionByCode } from '../lib/products.mjs';

const deck = productById('steam-deck');
const statusDoc = { version: 1, generatedAt: '2026-10-13T12:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products: {
  'steam-deck': { US: { status: 'in_stock', packages: [] }, DE: { status: 'out_of_stock', packages: [] }, FR: { status: 'out_of_stock', packages: [] } },
  'steam-frame': { DE: { status: 'waitlist', packages: [] }, FR: { status: 'waitlist', packages: [] } }
} };
const prices = { 946113: { US: { amount: 549, currency: 'USD', formatted: '$549.00' }, DE: { amount: 569, currency: 'EUR', formatted: '569,00€' }, FR: { amount: 569, currency: 'EUR', formatted: '569,00€' } } };
const history = { 'steam-deck:DE': { events: [{ ts: '2026-10-01T10:00:00.000Z', available: true, status: 'in_stock' }], lastInStock: '2026-10-01T10:00:00.000Z' } };

function faqLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  return blocks.find((b) => b['@type'] === 'FAQPage');
}
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

test('product and country pages carry a visible FAQ that matches the FAQPage JSON-LD', () => {
  const pages = [renderProductPage(deck, history, statusDoc, { prices }), renderRegionPage(deck, regionByCode('DE'), history, statusDoc, { prices })];
  for (const html of pages) {
    const ld = faqLd(html);
    assert.ok(ld, 'FAQPage present');
    assert.equal(ld['@context'], 'https://schema.org');
    assert.ok(ld.mainEntity.length >= 3);
    const section = html.match(/<section class="results-section faq"[\s\S]*?<\/section>/)[0];
    for (const q of ld.mainEntity) {
      assert.equal(q['@type'], 'Question');
      assert.equal(q.acceptedAnswer['@type'], 'Answer');
      assert.ok(section.includes(`<h3>${q.name.replace(/'/g, '&#39;')}</h3>`) || text(section).includes(q.name), q.name);
      assert.ok(text(section).includes(q.acceptedAnswer.text), `visible answer for ${q.name}`);
      assert.ok(!q.acceptedAnswer.text.includes('—'));
    }
  }
});

test('country FAQs use that country\'s own data', () => {
  const de = regionFaq(deck, regionByCode('DE'), history, statusDoc, prices);
  const all = de.map((x) => `${x.q} ${x.a}`).join(' ');
  assert.match(all, /Germany/);
  assert.match(all, /569,00€/);
  assert.match(all, /1 October 2026/);
  assert.match(all, /Steam Frame: Waitlist/);
  const us = regionFaq(deck, regionByCode('US'), history, statusDoc, prices).map((x) => x.a).join(' ');
  assert.match(us, /\$549\.00/);
  assert.match(us, /No restock .* recorded/);
  const jp = regionFaq(deck, regionByCode('JP'), {}, statusDoc, prices).map((x) => x.a).join(' ');
  assert.match(jp, /Komodo/);
  const br = regionFaq(deck, regionByCode('BR'), {}, statusDoc, prices).map((x) => x.a).join(' ');
  assert.match(br, /does not sell/);
});

test('no two country pages of a product share an FAQ, and each answer names the country', () => {
  for (const product of PRODUCTS) {
    const seen = new Map();
    for (const region of REGIONS) {
      const faq = regionFaq(product, region, history, statusDoc, prices);
      for (const { a } of faq) assert.ok(a.includes(region.name), `${product.id}/${region.code}: ${a}`);
      const key = faq.map((x) => x.q + x.a).join('|');
      assert.ok(!seen.has(key), `${product.id}/${region.code} copies ${seen.get(key)}`);
      seen.set(key, region.code);
      const stripped = faq.map((x) => x.a.split(region.name).join('X')).join('|');
      assert.ok(stripped.length > 0);
    }
  }
});

test('the product FAQ answers from the current status and prices', () => {
  const faq = productFaq(deck, history, statusDoc, prices);
  const all = faq.map((x) => x.a).join(' ');
  assert.match(all, new RegExp(`${VALVE_SELLS.length} countries`));
  assert.match(all, /in stock in 1 of/);
  assert.match(all, /\$549\.00/);
  assert.match(all, /every 10 minutes/i);
});

test('the product FAQ and FAQPage JSON-LD use the sold-in country count, not all 31', () => {
  const notInAu = new Set(['steam-dock', 'steam-deck-refurbished']);
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const status = notInAu.has(p.id) && cc === 'AU' ? 'unavailable_in_region' : 'out_of_stock';
      products[p.id][cc] = { status, packages: (p.packages || []).map((pk) => ({ id: pk.id, status })) };
    }
  }
  const doc = { version: 1, generatedAt: '2026-11-16T10:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products };
  const soldIn = VALVE_SELLS.length - 1;

  for (const id of ['steam-dock', 'steam-deck-refurbished']) {
    const product = productById(id);
    const html = renderProductPage(product, {}, doc, { prices: {} });
    const section = html.match(/<section class="results-section faq"[\s\S]*?<\/section>/)?.[0] || '';
    const ld = faqLd(html);
    const visible = text(section);
    const answers = (ld?.mainEntity || []).map((q) => q.acceptedAnswer.text).join(' ');
    assert.doesNotMatch(visible, /31 countries/, `${id} visible FAQ`);
    assert.doesNotMatch(answers, /31 countries/, `${id} FAQPage JSON-LD`);
    assert.match(visible, new RegExp(`${soldIn} countries`), `${id} visible FAQ`);
    assert.match(answers, new RegExp(`${soldIn} countries`), `${id} FAQPage JSON-LD`);
  }

  const deckHtml = renderProductPage(productById('steam-deck'), {}, doc, { prices: {} });
  const deckVisible = text(deckHtml.match(/<section class="results-section faq"[\s\S]*?<\/section>/)?.[0] || '');
  const deckAnswers = (faqLd(deckHtml)?.mainEntity || []).map((q) => q.acceptedAnswer.text).join(' ');
  assert.match(deckVisible, new RegExp(`${VALVE_SELLS.length} countries`));
  assert.match(deckAnswers, new RegExp(`${VALVE_SELLS.length} countries`));
});
