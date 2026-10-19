import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prerender, prerenderHome } from '../scripts/prerender.mjs';
import { parsePrice } from '../lib/prices.mjs';
import { VALVE_SELLS } from '../lib/products.mjs';
import { DECK_SALE_PATH, SEASON_END } from '../lib/deck-sale.mjs';

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
  const dist = mkdtempSync(path.join(tmpdir(), 'shs-sale-'));
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

  const dist = mkdtempSync(path.join(tmpdir(), 'shs-sale-none-'));
  writeFileSync(path.join(dist, 'index.html'), readFileSync(new URL('../public/index.html', import.meta.url)));
  await prerender(dist, { status, history, prices: {}, affiliate: OFF });
  const none = readFileSync(path.join(dist, `${DECK_SALE_PATH.slice(1)}.html`), 'utf8');
  assert.match(none.match(/<section[^>]*id="on-sale"[\s\S]*?<\/section>/)?.[0] || '', /no discount/i);
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
