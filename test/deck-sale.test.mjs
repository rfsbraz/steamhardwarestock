import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { prerender, prerenderHome } from '../scripts/prerender.mjs';
import { parsePrice } from '../lib/prices.mjs';
import { VALVE_SELLS } from '../lib/products.mjs';
import { DECK_SALE_PATH, SEASON_END, renderDeckSalePage } from '../lib/deck-sale.mjs';
import { formatDay } from '../lib/seo.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const SITE = 'https://steamhardwarestock.com';
const OFF = { jsaux: { refId: '' }, amazon: { enabled: false, tag: '' } };
const JSAUX_ON = { jsaux: { refId: 'ref123' }, amazon: { enabled: false, tag: '' } };

function pkgs(ids, statuses) {
  return ids.map((id, i) => ({ id, status: statuses[i] }));
}

const status = {
  version: 1,
  generatedAt: '2026-11-20T12:00:00.000Z',
  intervalSeconds: 600,
  regions: VALVE_SELLS,
  products: {
    'steam-deck': {
      US: { status: 'in_stock', packages: pkgs([946113, 946114, 595604], ['in_stock', 'out_of_stock', 'out_of_stock']) },
      DE: { status: 'out_of_stock', packages: pkgs([946113, 946114, 595604], ['out_of_stock', 'out_of_stock', 'out_of_stock']) }
    },
    'steam-deck-refurbished': {
      US: { status: 'in_stock', packages: pkgs([903906, 1202542], ['in_stock', 'out_of_stock']) }
    }
  }
};
const history = {
  'steam-deck:US': { productId: 'steam-deck', region: 'US', lastInStock: '2026-11-19T08:00:00.000Z', events: [{ ts: '2026-11-19T08:00:00.000Z', status: 'in_stock' }] },
  'steam-deck-refurbished:US': { productId: 'steam-deck-refurbished', region: 'US', events: [{ ts: '2026-11-18T10:00:00.000Z', status: 'in_stock' }] },
  'steam-dock:GB': { productId: 'steam-dock', region: 'GB', events: [{ ts: '2026-11-20T07:00:00.000Z', status: 'out_of_stock' }] }
};
const prices = {
  946113: { US: { amount: 631.2, currency: 'USD', formatted: '$631.20', discountPct: 20, formattedOriginal: '$789.00' } },
  946114: { US: { amount: 949, currency: 'USD', formatted: '$949.00' } }
};

async function build(affiliate = OFF) {
  const dist = tmpDir('shs-sale-');
  writeFileSync(path.join(dist, 'index.html'), readFileSync(new URL('../public/index.html', import.meta.url)));
  await prerender(dist, { status, history, prices, affiliate });
  const file = path.join(dist, `${DECK_SALE_PATH.slice(1)}.html`);
  return { dist, file, html: existsSync(file) ? readFileSync(file, 'utf8') : '', sitemap: readFileSync(path.join(dist, 'sitemap.xml'), 'utf8') };
}

test('the Steam Deck sale page is prerendered with SEO tags and structured data', async () => {
  const { file, html } = await build();
  assert.equal(DECK_SALE_PATH, '/steam-deck-black-friday');
  assert.ok(existsSync(file), 'page written');
  assert.match(html, /<title>[^<]*Black Friday[^<]*<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{50,160}">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}${DECK_SALE_PATH}">`));
  assert.match(html, /<meta name="robots" content="index,follow/);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.ok(ld.some((x) => x['@type'] === 'BreadcrumbList'), 'breadcrumbs');
  const faq = ld.find((x) => x['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage');
  for (const q of faq.mainEntity) assert.ok(html.includes(q.name.replace(/'/g, '&#39;')), `visible: ${q.name}`);
});

test('it shows live status per model and country, with the last stock change', async () => {
  const { html } = await build();
  const usRow = html.match(/<tr data-cc="US">[\s\S]*?<\/tr>/)?.[0] || '';
  assert.match(usRow, /United States/);
  assert.match(usRow, /badge in_stock/);
  assert.match(usRow, /badge out_of_stock/);
  assert.match(usRow, /datetime="2026-11-19T08:00:00.000Z"/);
  assert.match(html, /512GB OLED/);
  assert.match(html, /Refurbished/);
  assert.match(html, /datetime="2026-11-18T10:00:00.000Z"/);
  assert.match(html, /datetime="2026-11-20T12:00:00.000Z"/, 'last check time');
});

test('it lists the models Steam has on sale, and says so when none are', async () => {
  const { html } = await build();
  const sale = html.match(/<section[^>]*id="on-sale"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(sale, /512GB OLED/);
  assert.match(sale, /20% off/);
  assert.match(sale, /\$631\.20/);
  assert.match(sale, /\$789\.00/);
  assert.doesNotMatch(sale, /1TB OLED/);

  const dist = tmpDir('shs-sale-none-');
  writeFileSync(path.join(dist, 'index.html'), readFileSync(new URL('../public/index.html', import.meta.url)));
  const noDiscount = { 946113: { US: { amount: 789, currency: 'USD', formatted: '$789.00' } } };
  await prerender(dist, { status, history, prices: noDiscount, affiliate: OFF });
  const none = readFileSync(path.join(dist, `${DECK_SALE_PATH.slice(1)}.html`), 'utf8');
  assert.match(none.match(/<section[^>]*id="on-sale"[\s\S]*?<\/section>/)?.[0] || '', /no discount/i);
});

const saleOf = (html) => html.match(/<section[^>]*id="on-sale"[\s\S]*?<\/section>/)?.[0] || '';

test('the on-sale section says prices are missing when it has no Deck prices', () => {
  const cases = {
    omitted: renderDeckSalePage(history, status, {}),
    empty: renderDeckSalePage(history, status, { prices: {} }),
    dockOnly: renderDeckSalePage(history, status, {
      prices: { 761892: { US: { amount: 69, currency: 'USD', formatted: '£69.00' } } }
    })
  };
  for (const [label, html] of Object.entries(cases)) {
    const sale = saleOf(html);
    assert.doesNotMatch(sale, /no discount/i, label);
    assert.match(sale, /does not yet have Steam prices/i, label);
  }
});

test('parsePrice keeps the discount when Steam lists one', () => {
  assert.deepEqual(
    parsePrice('US', { formatted_final_price: '$631.20', final_price_in_cents: '63120', original_price_in_cents: '78900', formatted_original_price: '$789.00', discount_pct: 20 }),
    { amount: 631.2, currency: 'USD', formatted: '$631.20', discountPct: 20, formattedOriginal: '$789.00' }
  );
  assert.deepEqual(parsePrice('US', { formatted_final_price: '$789.00', final_price_in_cents: '78900' }), { amount: 789, currency: 'USD', formatted: '$789.00' });
});

test('the page is in the sitemap with lastmod from the Deck history', async () => {
  const { sitemap } = await build();
  const entry = sitemap.match(new RegExp(`<url>\\s*<loc>${SITE}${DECK_SALE_PATH}</loc>([\\s\\S]*?)</url>`));
  assert.ok(entry, 'sitemap entry');
  assert.match(entry[1], /<lastmod>2026-11-19T08:00:00.000Z<\/lastmod>/);
});

test('with no JSAUX ref the page has no JSAUX links and no affiliate disclosure', async () => {
  const { html } = await build(OFF);
  assert.doesNotMatch(html, /jsaux\.com/i);
  assert.doesNotMatch(html, /sponsored/);
  assert.doesNotMatch(html, /commission/);
});

test('with a JSAUX ref every JSAUX link carries it and the disclosure shows', async () => {
  const { html } = await build(JSAUX_ON);
  const links = [...html.matchAll(/href="(https:\/\/jsaux\.com[^"]*)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0);
  for (const l of links) assert.match(l, /[?&]sca_ref=ref123/);
  assert.match(html, /commission/);
});

test('the homepage links to the page until the season ends', () => {
  const source = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const before = prerenderHome(source, status, history, { now: new Date('2026-11-01T00:00:00Z') });
  assert.match(before, new RegExp(`<a href="${DECK_SALE_PATH}">`));
  const after = prerenderHome(source, status, history, { now: new Date(Date.parse(SEASON_END) + 1000) });
  assert.doesNotMatch(after, new RegExp(`href="${DECK_SALE_PATH}"`));
});


const PHRASE = 'Steam Deck Black Friday 2026';
const Q_ON_SALE = 'Is the Steam Deck on sale for Black Friday?';
const Q_DO_THEY = 'Do Steam Decks go on sale for Black Friday?';
const NO_DISCOUNT_PRICES = {
  946113: { US: { amount: 789, currency: 'USD', formatted: '$789.00' } }
};

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const titleOf = (html) => decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
const h1Of = (html) => decode((html.match(/<h1>([^<]*)<\/h1>/) || [])[1] || '');
const faqSection = (html) => html.match(/<section class="results-section faq"[\s\S]*?<\/section>/)?.[0] || '';
const faqLd = (html) => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  return blocks.find((b) => b['@type'] === 'FAQPage');
};
const visibleAnswer = (section, q) => {
  const re = new RegExp(`<h3>${q.replace(/[?]/g, '\\$&')}</h3>\\s*<p>([\\s\\S]*?)</p>`);
  return decode((section.match(re) || [])[1] || '').trim();
};

const SALE_CASES = [
  ['on sale', status, prices],
  ['not on sale', status, NO_DISCOUNT_PRICES],
  ['unknown', status, undefined]
];

test('title and H1 include the Black Friday phrase and the sale-status date in each sale-status case', () => {
  const date = formatDay(status.generatedAt);
  for (const [label, doc, pagePrices] of SALE_CASES) {
    const html = renderDeckSalePage(history, doc, pagePrices !== undefined ? { prices: pagePrices } : {});
    const title = titleOf(html);
    const h1 = h1Of(html);
    assert.ok(title.includes(PHRASE), `${label} title phrase: ${title}`);
    assert.ok(h1.includes(PHRASE), `${label} h1 phrase: ${h1}`);
    assert.ok(title.includes(date), `${label} title date: ${title}`);
    assert.ok(h1.includes(date), `${label} h1 date: ${h1}`);
  }
});

test('the two Black Friday sale questions are visible and match the FAQPage JSON-LD', () => {
  for (const [label, doc, pagePrices] of SALE_CASES) {
    const html = renderDeckSalePage(history, doc, pagePrices !== undefined ? { prices: pagePrices } : {});
    const section = faqSection(html);
    const ld = faqLd(html);
    assert.ok(ld, `${label}: FAQPage present`);
    assert.equal(ld['@context'], 'https://schema.org', `${label} @context`);
    assert.equal(ld['@type'], 'FAQPage', `${label} @type`);
    assert.ok(Array.isArray(ld.mainEntity) && ld.mainEntity.length >= 2, `${label}: questions`);
    for (const q of [Q_ON_SALE, Q_DO_THEY]) {
      assert.ok(section.includes(`<h3>${q}</h3>`), `${label} visible: ${q}`);
      const entity = ld.mainEntity.find((e) => e.name === q);
      assert.ok(entity, `${label} JSON-LD: ${q}`);
      assert.equal(entity['@type'], 'Question');
      assert.equal(entity.acceptedAnswer?.['@type'], 'Answer');
      const visible = visibleAnswer(section, q);
      assert.ok(visible, `${label} visible answer for ${q}`);
      assert.equal(entity.acceptedAnswer.text, visible, `${label} JSON-LD answer for ${q}`);
    }
  }
});

test('the new FAQ answers follow the current sale status', () => {
  const date = formatDay(status.generatedAt);
  const onSale = visibleAnswer(faqSection(renderDeckSalePage(history, status, { prices })), Q_ON_SALE);
  assert.match(onSale, /yes/i);
  assert.ok(onSale.includes(date), onSale);
  assert.match(onSale, /discount/i);
  assert.doesNotMatch(onSale, /no discount/i);

  const notOnSale = visibleAnswer(faqSection(renderDeckSalePage(history, status, { prices: NO_DISCOUNT_PRICES })), Q_ON_SALE);
  assert.match(notOnSale, /no/i);
  assert.ok(notOnSale.includes(date), notOnSale);
  assert.match(notOnSale, /no discount/i);

  const unknown = visibleAnswer(faqSection(renderDeckSalePage(history, status, {})), Q_ON_SALE);
  assert.doesNotMatch(unknown, /^yes/i);
  assert.doesNotMatch(unknown, /no discount/i);
  assert.match(unknown, /not yet|does not yet|unknown/i);

  const empty = visibleAnswer(faqSection(renderDeckSalePage(history, status, { prices: {} })), Q_ON_SALE);
  const dockOnly = visibleAnswer(faqSection(renderDeckSalePage(history, status, {
    prices: { 761892: { US: { amount: 69, currency: 'USD', formatted: '£69.00' } } }
  })), Q_ON_SALE);
  for (const [label, answer] of [['empty', empty], ['dock only', dockOnly]]) {
    assert.doesNotMatch(answer, /^yes/i, label);
    assert.doesNotMatch(answer, /no discount/i, label);
    assert.match(answer, /not yet|does not yet|unknown/i, label);
  }
});
