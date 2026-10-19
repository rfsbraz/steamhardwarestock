import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCTS, REGIONS, VALVE_SELLS } from '../lib/products.mjs';
import { currencyFor } from '../lib/prices.mjs';
import { renderProductPage, renderRegionPage, renderInfoPage, INFO_PAGES } from '../lib/landing.mjs';
import { renderStatusPage, STATUS_PAGE_PRODUCTS } from '../lib/status-page.mjs';
import { renderDeckSalePage } from '../lib/deck-sale.mjs';

// Bing flags descriptions under about 120 characters as too short, and
// search results cut titles past 60.
const DESCRIPTION = [120, 155];
const TITLE = [20, 60];

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const meta = (html) => ({
  title: decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
  description: decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '')
});

const STATUSES = [null, 'in_stock', 'out_of_stock', 'waitlist', 'reservation_open'];
const FORMATTED = { USD: '$1,059.00', CAD: 'C$ 1,379.00', GBP: '£1,059.00', AUD: 'A$ 1,749.00', PLN: '4 499,00 zł', EUR: '1.059,00€' };

function statusDoc(status) {
  if (!status) return null;
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) products[p.id][cc] = { status, button: 'waitlist', packages: p.packages.map((pk) => ({ id: pk.id, status })) };
  }
  return { version: 1, generatedAt: '2026-10-13T12:00:00.000Z', regions: VALVE_SELLS, products };
}

const PRICES = {};
for (const p of PRODUCTS) {
  for (const pk of p.packages) {
    PRICES[pk.id] = Object.fromEntries(VALVE_SELLS.map((cc) => [cc, { amount: 1059, currency: currencyFor(cc), formatted: FORMATTED[currencyFor(cc)] }]));
  }
}

function history() {
  const out = {};
  for (const p of PRODUCTS) for (const r of REGIONS) out[`${p.id}:${r.code}`] = { lastInStock: '2026-09-20T09:30:00.000Z', events: [{ ts: '2026-09-20T09:30:00.000Z', available: true }] };
  return out;
}

// Every page the site renders, across the data states a build can see:
// no status yet, each stock status, with and without prices and history.
function* pages() {
  for (const status of STATUSES) {
    const doc = statusDoc(status);
    for (const prices of [{}, PRICES]) {
      for (const hist of [{}, history()]) {
        const tag = `status=${status} prices=${prices === PRICES} history=${Object.keys(hist).length > 0}`;
        for (const p of PRODUCTS) {
          yield [`/${p.id} ${tag}`, renderProductPage(p, hist, doc, { prices })];
          for (const r of REGIONS) yield [`/${p.id}/${r.code.toLowerCase()} ${tag}`, renderRegionPage(p, r, hist, doc, { prices })];
        }
        yield [`/steam-deck-black-friday ${tag}`, renderDeckSalePage(hist, doc, { prices })];
      }
    }
    for (const p of PRODUCTS.filter((x) => STATUS_PAGE_PRODUCTS.includes(x.id))) yield [`/${p.id}/status status=${status}`, renderStatusPage(p, doc)];
  }
  for (const page of INFO_PAGES) yield [page.path, renderInfoPage(page)];
  for (const file of ['index.html', 'history.html']) yield [`/${file}`, readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')];
}

test('every page has a 120 to 155 character description and a 20 to 60 character title', () => {
  const bad = [];
  let n = 0;
  for (const [where, html] of pages()) {
    n++;
    const { title, description } = meta(html);
    if (description.length < DESCRIPTION[0] || description.length > DESCRIPTION[1]) bad.push(`${where}: description ${description.length}: ${description}`);
    if (title.length < TITLE[0] || title.length > TITLE[1]) bad.push(`${where}: title ${title.length}: ${title}`);
  }
  assert.ok(n > 1000, `only ${n} pages rendered`);
  assert.deepEqual([...new Set(bad.map((b) => b.replace(/ status=\S+ prices=\S+ history=\S+/, '')))].slice(0, 40), [], `${bad.length} failures`);
});

test('country descriptions name the product, the country, the status and an alert', () => {
  const de = REGIONS.find((r) => r.code === 'DE');
  for (const p of PRODUCTS) {
    const { description } = meta(renderRegionPage(p, de, {}, statusDoc('out_of_stock'), { prices: PRICES }));
    assert.match(description, /Germany/, p.id);
    assert.match(description, /out of stock/i, p.id);
    assert.match(description, /alert/i, p.id);
  }
});
