// /<product>/status: the sales mode Steam shows in each country (the button
// state from status.json) plus Valve's latest official update, from the
// hand-edited data/valve-updates.json.
import { readFileSync } from 'node:fs';
import StockStatus from '../public/stock-status.js';
import { REGIONS, VALVE_SELLS } from './products.mjs';
import { SITE } from './site.mjs';
import { soldViaKomodo, KOMODO_PRODUCTS } from './seo.mjs';
import { escape, shellHead, shellFooter, breadcrumbsLd, ROBOTS_INDEX } from './landing.mjs';
import { ANALYTICS_BODY } from './analytics.mjs';
import { STATUS_PAGE_PRODUCTS } from './status-products.mjs';

export { STATUS_PAGE_PRODUCTS };

const UPDATES = JSON.parse(readFileSync(new URL('../data/valve-updates.json', import.meta.url), 'utf8'));

export function latestUpdate(productId, updates = UPDATES) {
  return updates.filter((u) => u.product === productId).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
}

function modeFor(product, region, statusDoc) {
  if (soldViaKomodo(product, region.code)) return { label: 'Sold via Komodo', key: 'komodo' };
  if (!VALVE_SELLS.includes(region.code)) return { label: 'Not sold on Steam', key: 'none' };
  const cell = statusDoc?.products?.[product.id]?.[region.code];
  if (!cell?.button) return { label: 'Not checked yet', key: 'unknown' };
  return { label: StockStatus.BUTTONS[cell.button].label, key: cell.button };
}

const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function renderStatusPage(product, statusDoc) {
  const canonical = `${SITE}/${product.id}/status`;
  const update = latestUpdate(product.id);
  const rows = REGIONS.map((region) => ({ region, mode: modeFor(product, region, statusDoc) }));
  const counts = {};
  for (const r of rows) counts[r.mode.label] = (counts[r.mode.label] || 0) + 1;
  const tally = Object.entries(counts).filter(([l]) => !/Not sold|Not checked/.test(l)).map(([l, n]) => `${escape(l)}: ${n}`).join(', ');
  const title = `${product.name} Reservation Status by Country`;
  const description = `Whether Steam shows Buy, Reserve or Join waitlist for the ${product.name} in each country, checked every 10 minutes, plus Valve's latest reservation update.`;
  const crumbs = breadcrumbsLd([{ name: 'Home', url: `${SITE}/` }, { name: product.name, url: `${SITE}/${product.id}` }, { name: 'Reservation status', url: canonical }]);
  const komodoNote = KOMODO_PRODUCTS[product.id] ? ' In Japan, South Korea, Hong Kong and Taiwan it is sold through Komodo, which this page does not check.' : '';

  return `${shellHead({ title, description, canonical, robots: ROBOTS_INDEX, jsonLd: [crumbs] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/${product.id}">← ${escape(product.name)}</a></p>
      <h1>${escape(product.name)} reservation status by country</h1>
    </div>
  </header>

  <p class="intro">This is the button Steam shows for the ${escape(product.name)} in each country${statusDoc?.generatedAt ? `, as of <time datetime="${escape(statusDoc.generatedAt)}">${escape(new Date(statusDoc.generatedAt).toUTCString())}</time>` : ''}.${tally ? ` Right now: ${tally}.` : ''}${komodoNote}</p>

  ${update ? `<section class="results-section" aria-labelledby="valve-update-title">
    <h2 id="valve-update-title">Latest update from Valve</h2>
    <p><time datetime="${escape(update.date)}">${escape(dayLabel(update.date))}</time>: ${escape(update.title)}</p>
    <p>${escape(update.summary)}</p>
    <p><a href="${escape(update.source)}" rel="noreferrer" target="_blank">Read Valve's post on Steam →</a></p>
  </section>` : ''}

  <section class="results-section" aria-labelledby="modes-title">
    <h2 id="modes-title">What the buttons mean</h2>
    <ul>
      <li><strong>Buy</strong>: Steam has units and you can order now.</li>
      <li><strong>Reserve</strong>: you can join the reservation queue. Steam emails you when you can order.</li>
      <li><strong>Join waitlist</strong>: the reservation queue is full, so you join the waitlist behind it.</li>
      <li><strong>Unavailable</strong>: Steam sells it in that country but shows no way to order or reserve right now.</li>
    </ul>
  </section>

  <section class="results-section" aria-label="Sales mode by country">
    <div class="history-table-wrap">
    <table class="history-table">
      <thead><tr><th scope="col">Country</th><th scope="col">On Steam now</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td><a href="/${product.id}/${r.region.code.toLowerCase()}">${escape(r.region.name)}</a></td><td><span class="badge mode-${r.mode.key}">${escape(r.mode.label)}</span></td></tr>`).join('')}</tbody>
    </table>
    </div>
  </section>

  ${shellFooter()}
</main>
${ANALYTICS_BODY}
</body>
</html>`;
}
