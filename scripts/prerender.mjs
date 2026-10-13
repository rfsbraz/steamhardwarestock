import fs from 'node:fs/promises';
import path from 'node:path';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';
import { renderProductPage, renderRegionPage } from '../lib/landing.mjs';
import StockStatus from '../public/stock-status.js';

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Status and history at build time. Prefer what the cron stored in Blob; with
// no token (forks, local builds) run one live Steam check instead.
export async function loadData() {
  let status = null;
  let history = {};
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const store = await import('../lib/history-store.mjs');
    try {
      const text = await store.readStatusText();
      status = text ? JSON.parse(text) : null;
    } catch (error) {
      console.warn('prerender: status.json unavailable:', error?.message);
    }
    try {
      history = (await store.readHistoryFresh()).history;
    } catch (error) {
      console.warn('prerender: history unavailable:', error?.message);
    }
  }
  if (!status && process.env.PRERENDER_OFFLINE !== '1') {
    try {
      const { checkAll } = await import('../lib/steam.mjs');
      const { buildStatusDoc } = await import('../lib/status-doc.mjs');
      const { results } = await checkAll();
      status = buildStatusDoc(results, { generatedAt: new Date().toISOString(), intervalSeconds: 600 });
    } catch (error) {
      console.warn('prerender: live check failed:', error?.message);
    }
  }
  return { status, history };
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

export async function prerender(dist, { status, history }) {
  const indexPath = path.join(dist, 'index.html');
  const index = await fs.readFile(indexPath, 'utf8');
  await fs.writeFile(indexPath, prerenderHome(index, status));

  let pages = 0;
  for (const product of PRODUCTS) {
    const dir = path.join(dist, product.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), renderProductPage(product, history, status));
    pages++;
    for (const region of REGIONS) {
      const regionDir = path.join(dir, region.code.toLowerCase());
      await fs.mkdir(regionDir, { recursive: true });
      await fs.writeFile(path.join(regionDir, 'index.html'), renderRegionPage(product, region, history, status));
      pages++;
    }
  }
  return pages;
}
