import fs from 'node:fs/promises';
import path from 'node:path';
import { PRODUCTS, REGIONS, VALVE_SELLS } from '../lib/products.mjs';
import { renderProductPage, renderRegionPage, renderInfoPage, renderNotFoundPage, INFO_PAGES, productCards, CARD_SCRIPT } from '../lib/landing.mjs';
import { CHECKED_REGIONS } from '../lib/steam.mjs';
import { isIndexable, latestEvent, KOMODO_REGIONS } from '../lib/seo.mjs';
import { buildSitemap } from '../lib/sitemap.mjs';
import { renderStatusPage, STATUS_PAGE_PRODUCTS, latestUpdate } from '../lib/status-page.mjs';
import StockStatus from '../public/stock-status.js';
import { renderDeckSalePage, deckSaleLastmod, seasonLink, DECK_SALE_PATH } from '../lib/deck-sale.mjs';

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Status and history at build time. PRERENDER_SOURCE_URL points at a deployed
// site (the Pages build reads the live KV data through its own functions).
// Without it (forks, local builds) run one live Steam check instead.
//
// PRERENDER_MIN_GENERATED_AT is the check that asked for this build. KV can
// serve the previous check for up to a minute after a write, so status.json
// is fetched again until it has that check, or the wait runs out.
const STATUS_RETRY_MS = 10 * 1000;
const STATUS_RETRIES = 18;

async function loadFromUrl(base, fetchImpl, minGeneratedAt, sleep) {
  const get = async (path) => {
    const res = await fetchImpl(new URL(path, base));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  const min = minGeneratedAt ? Date.parse(minGeneratedAt) : NaN;
  const stale = (doc) => Number.isFinite(min) && !(Date.parse(doc?.generatedAt) >= min);
  let status = null;
  let history = {};
  for (let attempt = 0; ; attempt++) {
    try { status = await get('/status.json'); } catch (error) { console.warn('prerender: status.json unavailable:', error?.message); }
    if (!status || !stale(status)) break;
    if (attempt === STATUS_RETRIES) {
      console.warn(`prerender: status.json is still from ${status.generatedAt}, not ${minGeneratedAt}; building with it`);
      break;
    }
    await sleep(STATUS_RETRY_MS);
  }
  try { history = await get('/api/history'); } catch (error) { console.warn('prerender: history unavailable:', error?.message); }
  return { status, history };
}

export async function loadData({ env = process.env, fetchImpl = (...a) => fetch(...a), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  // PRERENDER_FIXTURE: a JSON file with { status, history, prices }, for tests.
  if (env.PRERENDER_FIXTURE) {
    const data = JSON.parse(await fs.readFile(env.PRERENDER_FIXTURE, 'utf8'));
    return { status: data.status || null, history: data.history || {}, prices: data.prices || {} };
  }
  let status = null;
  let history = {};
  let prices = {};
  if (env.PRERENDER_SOURCE_URL) {
    ({ status, history } = await loadFromUrl(env.PRERENDER_SOURCE_URL, fetchImpl, env.PRERENDER_MIN_GENERATED_AT, sleep));
  }
  if (!status && env.PRERENDER_OFFLINE !== '1') {
    try {
      const { checkAll } = await import('../lib/steam.mjs');
      const { buildStatusDoc } = await import('../lib/status-doc.mjs');
      const { results } = await checkAll();
      status = buildStatusDoc(results, { generatedAt: new Date().toISOString(), intervalSeconds: 600 });
    } catch (error) {
      console.warn('prerender: live check failed:', error?.message);
    }
  }
  // Prices for the Product JSON-LD and the country pages. Without them the
  // pages build without offers.
  if (env.PRERENDER_OFFLINE !== '1') {
    const { fetchPrices } = await import('../lib/prices.mjs');
    prices = await fetchPrices({ fetchImpl });
  }
  return { status, history, prices };
}

function summary(status) {
  const rows = [];
  let inStock = 0;
  for (const product of PRODUCTS) {
    const counts = {};
    for (const cell of Object.values(status?.products?.[product.id] || {})) {
      counts[cell.status] = (counts[cell.status] || 0) + 1;
    }
    inStock += counts.in_stock || 0;
    const parts = StockStatus.STATUSES
      .filter((s) => counts[s])
      .map((s) => `${StockStatus.copyFor(s).label}: ${counts[s]}`);
    rows.push(`<li><a href="/${product.id}">${escape(product.name)}</a>: ${escape(parts.join(', ') || 'not checked yet')}</li>`);
  }
  return { inStock, rows };
}

// Static homepage status so crawlers and link previews see real numbers.
// app.js replaces all of it as soon as it runs.
function homeIntro(status, regions) {
  const sold = regions.length;
  const komodo = KOMODO_REGIONS.length;
  const names = PRODUCTS.map((p) => p.name);
  const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const counts = {};
  for (const product of PRODUCTS) {
    for (const cell of Object.values(status?.products?.[product.id] || {})) counts[cell.status] = (counts[cell.status] || 0) + 1;
  }
  const queue = (counts.reservation_open || 0) + (counts.waitlist || 0);
  const snapshot = status?.generatedAt
    ? `<p>At the last check, Steam showed ${counts.in_stock || 0} product and country pairs in stock and ${queue} taking reservations or running a waitlist.</p>`
    : '';
  return `<section class="home-intro" aria-label="About this tracker">
        <h2>About this tracker</h2>
        <p>This free tracker follows the official Steam store for ${list}. It checks ${sold} countries, the ones where Valve sells its hardware on the Steam store. In ${komodo} more, Valve sells some of it through Komodo, its official distributor. The tracker does not check Komodo stock, so those pages say so and link to Komodo instead.</p>
        <p>Every 10 minutes the tracker asks Steam for the state of each product in each of those ${sold} countries. A product can be in stock, out of stock, open for reservations, or on a waitlist, and the answer often differs from one country to the next. Each product has its own page with a table of every country, and each country has its own page with the current state, the local price when Steam lists one, and the last time it was in stock.</p>
        ${snapshot}
        <p>To get an alert, pick the products and countries you care about in the watch form above and press Start watching. Your browser tells you when one of them changes. Your watch list stays in your browser, and you do not need an account. Past changes are kept on the stock history page, which shows when each product last came back in every country.</p>
      </section>`;
}

// The file a page URL is served from. Cloudflare Pages serves /x from x.html
// with a 200 and sends /x/ to /x, which matches the no-slash canonical and
// sitemap URL. x/index.html would do the opposite: /x would 308 to /x/.
export function pageFile(dist, urlPath) {
  if (urlPath === '/') return path.join(dist, 'index.html');
  return path.join(dist, `${urlPath.replace(/^\/+|\/+$/g, '')}.html`);
}

async function writePage(dist, urlPath, html) {
  const file = pageFile(dist, urlPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
}

function withDateModified(html, when) {
  if (!when) return html;
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, (m, json) => {
    const ld = JSON.parse(json);
    ld.dateModified = when;
    return `<script type="application/ld+json">${JSON.stringify(ld, null, 2).replace(/</g, '\\u003c')}</script>`;
  });
}

export function prerenderHome(html, status, history = {}, { regions = CHECKED_REGIONS, now = new Date() } = {}) {
  const { inStock, rows } = summary(status);
  const regionCount = status?.regions?.length || 0;
  const when = status?.generatedAt;
  let out = html.replace('id="availableCount">0<', `id="availableCount">${inStock}<`);
  out = out.replace('id="lastChecked">Never<', when
    ? `id="lastChecked"><time datetime="${escape(when)}">${escape(new Date(when).toUTCString().slice(17, 22))} UTC</time><`
    : 'id="lastChecked">Never<');
  out = out.replace('<div class="results-grid" id="resultsGrid"></div>', `<div class="results-grid" id="resultsGrid"><div class="empty-state"><p>Stock across the ${regionCount} countries where Steam sells Valve hardware${when ? `, as of <time datetime="${escape(when)}">${escape(new Date(when).toUTCString())}</time>` : ''}:</p><ul>${rows.join('')}</ul></div></div>`);
  out = out.replace('<h1>Steam Hardware Tracker: Stock and Reservation Status</h1>', `<h1>Steam Hardware Tracker: Stock and Reservation Status in ${regions.length} Countries</h1>`);
  out = out.replace('<!-- home:cards -->', productCards(PRODUCTS, status) + CARD_SCRIPT);
  out = out.replace('<!-- home:intro -->', homeIntro(status, regions));
  out = out.replace('<!-- home:season -->', seasonLink(now));
  out = withDateModified(out, latestEvent(history, Object.keys(history || {})) || status?.generatedAt || null);
  return out;
}

// Writes the homepage status, every landing page and sitemap.xml. The sitemap
// lists only indexable pages, each with the time of its last recorded stock
// change as lastmod (omitted when there is none).
export async function prerender(dist, { status, history = {}, affiliate, prices = {} }) {
  const indexPath = path.join(dist, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  await fs.writeFile(indexPath, prerenderHome(index, status, history));

  const allKeys = Object.keys(history || {});
  const sitemap = [
    { path: '/', lastmod: latestEvent(history, allKeys) },
    { path: '/history', lastmod: latestEvent(history, allKeys) },
    ...INFO_PAGES.map((p) => ({ path: p.path })),
    { path: DECK_SALE_PATH, lastmod: deckSaleLastmod(history) }
  ];
  await writePage(dist, DECK_SALE_PATH, renderDeckSalePage(history, status, { affiliate, prices }));
  for (const page of INFO_PAGES) {
    await writePage(dist, page.path, renderInfoPage(page, { affiliate }));
  }
  let pages = 0;
  for (const product of PRODUCTS) {
    await writePage(dist, `/${product.id}`, renderProductPage(product, history, status, { affiliate, prices }));
    sitemap.push({ path: `/${product.id}`, lastmod: latestEvent(history, REGIONS.map((r) => `${product.id}:${r.code}`)) });
    pages++;
    if (STATUS_PAGE_PRODUCTS.includes(product.id)) {
      await writePage(dist, `/${product.id}/status`, renderStatusPage(product, status));
      const changed = latestEvent(history, REGIONS.map((r) => `${product.id}:${r.code}`));
      const update = latestUpdate(product.id);
      const updated = update ? `${update.date}T00:00:00.000Z` : null;
      sitemap.push({ path: `/${product.id}/status`, lastmod: [changed, updated].filter(Boolean).sort().pop() || null });
      pages++;
    }
    for (const region of REGIONS) {
      const code = region.code.toLowerCase();
      await writePage(dist, `/${product.id}/${code}`, renderRegionPage(product, region, history, status, { affiliate, prices }));
      if (isIndexable(product, region.code)) {
        sitemap.push({ path: `/${product.id}/${code}`, lastmod: latestEvent(history, [`${product.id}:${region.code}`]) });
      }
      pages++;
    }
  }
  // Top-level 404.html turns off the Pages SPA fallback, so unknown paths get
  // a real 404 instead of the homepage. Not in the sitemap.
  await fs.writeFile(path.join(dist, '404.html'), renderNotFoundPage());
  await fs.writeFile(path.join(dist, 'sitemap.xml'), buildSitemap(sitemap));
  return pages;
}
