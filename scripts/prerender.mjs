import fs from 'node:fs/promises';
import path from 'node:path';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';
import { renderProductPage, renderRegionPage } from '../lib/landing.mjs';
import { isIndexable, latestEvent } from '../lib/seo.mjs';
import { buildSitemap } from '../lib/sitemap.mjs';
import { renderStatusPage, STATUS_PAGE_PRODUCTS, latestUpdate } from '../lib/status-page.mjs';
import StockStatus from '../public/stock-status.js';

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Status and history at build time. PRERENDER_SOURCE_URL points at a deployed
// site (the Pages build reads the live KV data through its own functions).
// Without it (forks, local builds) run one live Steam check instead.
async function loadFromUrl(base, fetchImpl) {
  const get = async (path) => {
    const res = await fetchImpl(new URL(path, base));
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  let status = null;
  let history = {};
  try { status = await get('/status.json'); } catch (error) { console.warn('prerender: status.json unavailable:', error?.message); }
  try { history = await get('/api/history'); } catch (error) { console.warn('prerender: history unavailable:', error?.message); }
  return { status, history };
}

export async function loadData({ env = process.env, fetchImpl = (...a) => fetch(...a) } = {}) {
  // PRERENDER_FIXTURE: a JSON file with { status, history, prices }, for tests.
  if (env.PRERENDER_FIXTURE) {
    const data = JSON.parse(await fs.readFile(env.PRERENDER_FIXTURE, 'utf8'));
    return { status: data.status || null, history: data.history || {}, prices: data.prices || {} };
  }
  let status = null;
  let history = {};
  let prices = {};
  if (env.PRERENDER_SOURCE_URL) {
    ({ status, history } = await loadFromUrl(env.PRERENDER_SOURCE_URL, fetchImpl));
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
export function prerenderHome(html, status) {
  const { inStock, rows } = summary(status);
  const regionCount = status?.regions?.length || 0;
  const when = status?.generatedAt;
  let out = html.replace('id="availableCount">0<', `id="availableCount">${inStock}<`);
  out = out.replace('id="lastChecked">Never<', when
    ? `id="lastChecked"><time datetime="${escape(when)}">${escape(new Date(when).toUTCString().slice(17, 22))} UTC</time><`
    : 'id="lastChecked">Never<');
  out = out.replace('<div class="results-grid" id="resultsGrid"></div>', `<div class="results-grid" id="resultsGrid"><div class="empty-state"><p>Stock across the ${regionCount} countries where Steam sells Valve hardware${when ? `, as of <time datetime="${escape(when)}">${escape(new Date(when).toUTCString())}</time>` : ''}:</p><ul>${rows.join('')}</ul></div></div>`);
  return out;
}

// Writes the homepage status, every landing page and sitemap.xml. The sitemap
// lists only indexable pages, each with the time of its last recorded stock
// change as lastmod (omitted when there is none).
export async function prerender(dist, { status, history = {}, affiliate, prices = {} }) {
  const indexPath = path.join(dist, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  await fs.writeFile(indexPath, prerenderHome(index, status));

  const allKeys = Object.keys(history || {});
  const sitemap = [
    { path: '/', lastmod: latestEvent(history, allKeys) },
    { path: '/history', lastmod: latestEvent(history, allKeys) }
  ];
  let pages = 0;
  for (const product of PRODUCTS) {
    const dir = path.join(dist, product.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), renderProductPage(product, history, status, { affiliate, prices }));
    sitemap.push({ path: `/${product.id}`, lastmod: latestEvent(history, REGIONS.map((r) => `${product.id}:${r.code}`)) });
    pages++;
    if (STATUS_PAGE_PRODUCTS.includes(product.id)) {
      await fs.mkdir(path.join(dir, 'status'), { recursive: true });
      await fs.writeFile(path.join(dir, 'status', 'index.html'), renderStatusPage(product, status));
      const changed = latestEvent(history, REGIONS.map((r) => `${product.id}:${r.code}`));
      const update = latestUpdate(product.id);
      const updated = update ? `${update.date}T00:00:00.000Z` : null;
      sitemap.push({ path: `/${product.id}/status`, lastmod: [changed, updated].filter(Boolean).sort().pop() || null });
      pages++;
    }
    for (const region of REGIONS) {
      const code = region.code.toLowerCase();
      const regionDir = path.join(dir, code);
      await fs.mkdir(regionDir, { recursive: true });
      await fs.writeFile(path.join(regionDir, 'index.html'), renderRegionPage(product, region, history, status, { affiliate, prices }));
      if (isIndexable(product, region.code)) {
        sitemap.push({ path: `/${product.id}/${code}`, lastmod: latestEvent(history, [`${product.id}:${region.code}`]) });
      }
      pages++;
    }
  }
  await fs.writeFile(path.join(dist, 'sitemap.xml'), buildSitemap(sitemap));
  return pages;
}
