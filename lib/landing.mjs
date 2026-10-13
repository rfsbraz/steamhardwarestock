import { REGIONS, VALVE_SELLS, PRODUCTS, isCheckable } from './products.mjs';
import StockStatus from '../public/stock-status.js';
import { ANALYTICS_HEAD, ANALYTICS_BODY } from './analytics.mjs';
import Affiliate from '../public/affiliate.js';
import { SITE } from './site.mjs';
import {
  seoFor, soldOnSteam, soldViaKomodo, isIndexable, fitTitle, fitDescription, formatDay, KOMODO_PRODUCTS
} from './seo.mjs';

const NO_AFFILIATE = { jsaux: { refId: '' }, amazon: { enabled: false, tag: '' } };
const KOMODO_ORIGIN = 'https://komodostation.com';
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.code, r.name]));

// The block, the footer line and the inline click tracker, all empty without IDs.
function affiliateParts(productId, config = NO_AFFILIATE) {
  const block = Affiliate.accessoryBlock(productId, config);
  const footer = Affiliate.footerDisclosure(config);
  const tracker = block ? `<script>(${Affiliate.installClickTracking.toString()})(document, window);</script>` : '';
  return { block, footer, tracker };
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Current status from the cron's status.json. Regions the cron skips are not
// sold there. With no status.json at all the page says it was not checked yet.
function cellStatus(statusDoc, product, regionCode) {
  if (!statusDoc) return null;
  if (!Array.isArray(statusDoc.regions) || !statusDoc.regions.includes(regionCode)) return 'unavailable_in_region';
  return statusDoc.products?.[product.id]?.[regionCode]?.status || null;
}

function cell(statusDoc, product, regionCode) {
  return statusDoc?.products?.[product.id]?.[regionCode] || null;
}

function statusCopy(status) {
  return status ? StockStatus.copyFor(status).label : 'Not checked yet';
}

function lastCheckHtml(statusDoc) {
  if (!statusDoc?.generatedAt) return '<p class="intro">Last check: not checked yet.</p>';
  return `<p class="intro">Last check: <time datetime="${escape(statusDoc.generatedAt)}">${escape(formatDate(statusDoc.generatedAt))}</time>.</p>`;
}

function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(diff / 86_400_000);
  return `${d}d ago`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toUTCString();
}

function steamUrl(product, regionCode) {
  if (!product.steamPath) return null;
  const u = new URL(product.steamPath, 'https://store.steampowered.com');
  if (regionCode) u.searchParams.set('cc', regionCode);
  u.searchParams.set('l', 'english');
  return u.toString();
}

// app.js reads ?p=<product>&r=<region>.
function trackerUrl(product, regionCode) {
  return `/?p=${encodeURIComponent(product.id)}${regionCode ? `&r=${encodeURIComponent(regionCode)}` : ''}`;
}

const SCHEMA_AVAILABILITY = {
  in_stock: 'https://schema.org/InStock',
  reservation_open: 'https://schema.org/PreOrder',
  waitlist: 'https://schema.org/BackOrder',
  out_of_stock: 'https://schema.org/OutOfStock'
};

function modelName(product, pkg) {
  return pkg?.label ? `${product.name} ${pkg.label}` : product.name;
}

// One Offer per region for the base model, only where Steam gave a price and
// the status maps to a schema.org availability.
function baseOffers(product, statusDoc, prices, regionCodes) {
  const base = product.packages?.[0];
  if (!base) return [];
  const offers = [];
  for (const cc of regionCodes) {
    const price = prices?.[base.id]?.[cc];
    const c = cell(statusDoc, product, cc);
    const pkgStatus = c?.packages?.find((p) => p.id === base.id)?.status || c?.status;
    const availability = SCHEMA_AVAILABILITY[pkgStatus];
    if (!price || !availability) continue;
    offers.push({
      '@type': 'Offer',
      price: price.amount,
      priceCurrency: price.currency,
      availability,
      url: steamUrl(product, cc),
      eligibleRegion: { '@type': 'Country', name: cc },
      seller: { '@type': 'Organization', name: 'Valve' }
    });
  }
  return offers;
}

// Google requires offers (or reviews) on a Product, so no offers means no Product.
function productLd(product, offers) {
  if (!offers.length) return null;
  const base = product.packages[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: modelName(product, base),
    sku: String(base.id),
    description: product.blurb,
    image: product.icon,
    brand: { '@type': 'Brand', name: 'Valve' },
    offers: offers.length === 1 ? offers[0] : offers
  };
}

function shellHead({ title, description, canonical, robots, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${ANALYTICS_HEAD}
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(canonical)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#202124">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://clan.akamai.steamstatic.com">
<link rel="preconnect" href="https://clan.fastly.steamstatic.com">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Steam Hardware Stock Tracker">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="stylesheet" href="/styles.css">
${jsonLd.filter(Boolean).map((ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`).join('\n')}
<script>(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='auto';document.documentElement.dataset.theme=t;}catch(_){document.documentElement.dataset.theme='auto';}})();</script>
</head>`;
}

const ROBOTS_INDEX = 'index,follow,max-image-preview:large,max-snippet:-1';
const ROBOTS_NOINDEX = 'noindex,follow';

function shellFooter(disclosure = '') {
  return `<footer class="site-footer"><div class="footer-inner"><a href="/">Tracker</a> · <a href="/history">History</a> · <a href="https://github.com/rfsbraz/steamhardwarestock">GitHub</a>${disclosure ? ` ${disclosure}` : ''}</div></footer>`;
}

function breadcrumbsLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url }))
  };
}

// Recorded moves into stock for a product, newest first.
function restockEvents(product, history, regionCodes = REGIONS.map((r) => r.code)) {
  const out = [];
  for (const cc of regionCodes) {
    for (const e of history?.[`${product.id}:${cc}`]?.events || []) {
      if (e?.ts && (e.status === 'in_stock' || (!e.status && e.available))) out.push({ cc, ts: e.ts });
    }
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

function deliveryText(c) {
  const d = c?.packages?.[0]?.details;
  const lo = d?.estimated_delivery_soonest_business_days;
  const hi = d?.estimated_delivery_latest_business_days;
  if (!lo || !hi) return null;
  return lo === hi ? `${lo} business days` : `${lo} to ${hi} business days`;
}

function priceRows(product, prices, cc) {
  return (product.packages || [])
    .map((pkg) => ({ pkg, price: prices?.[pkg.id]?.[cc] }))
    .filter((r) => r.price);
}

function restockSection(product, history, statusDoc) {
  const events = restockEvents(product, history).slice(0, 10);
  const inStockNow = VALVE_SELLS.filter((cc) => cellStatus(statusDoc, product, cc) === 'in_stock');
  const list = events.length
    ? `<ul>${events.map((e) => `<li><time datetime="${escape(e.ts)}">${escape(formatDay(e.ts))}</time>: <a href="/${product.id}/${e.cc.toLowerCase()}">${escape(REGION_NAME[e.cc] || e.cc)}</a></li>`).join('')}</ul>`
    : '<p>No restock has been recorded yet.</p>';
  return `<section class="results-section" id="restock" aria-labelledby="restock-title">
    <h2 id="restock-title">${escape(product.name)} restock tracker</h2>
    <p>Valve does not announce ${escape(product.name)} restocks in advance. This page reads the Steam Store every 10 minutes in the ${VALVE_SELLS.length} countries where Steam sells hardware, and records each time a country goes from out of stock to in stock.</p>
    <p>${inStockNow.length ? `In stock now in ${inStockNow.length} ${inStockNow.length === 1 ? 'country' : 'countries'}: ${inStockNow.map((cc) => escape(REGION_NAME[cc])).join(', ')}.` : 'Not in stock in any Steam country at the last check.'}</p>
    <h3>Recorded restocks</h3>
    ${list}
    <p>A restock here means Steam reported inventory for the country. When Steam shows a pending order queue, the buy button can stay off even with stock, so a restock can sell out within minutes.</p>
  </section>`;
}

function productTitle(product) {
  return seoFor(product).title;
}

function productDescription(product, statusDoc) {
  const seo = seoFor(product);
  const sold = statusDoc ? VALVE_SELLS.length : null;
  const inStock = VALVE_SELLS.filter((cc) => cellStatus(statusDoc, product, cc) === 'in_stock').length;
  const required = [seo.lead];
  const optional = [];
  if (sold) optional.push(`In stock in ${inStock} of ${sold} Steam countries at the last check.`);
  optional.push('Free stock alerts.');
  return fitDescription(required, optional);
}

export function renderProductPage(product, history, statusDoc, { affiliate, prices } = {}) {
  const aff = affiliateParts(product.id, affiliate);
  const canonical = `${SITE}/${product.id}`;
  const checkable = isCheckable(product);

  const rows = REGIONS.map((region) => {
    const entry = history?.[`${product.id}:${region.code}`];
    const status = checkable ? cellStatus(statusDoc, product, region.code) : null;
    return { region, entry, status, lastIn: entry?.lastInStock ? relativeTime(entry.lastInStock) : null };
  });
  const inStockCount = rows.filter((r) => r.status === 'in_stock').length;
  const soldIn = REGIONS.filter((r) => soldOnSteam(r.code));

  const title = productTitle(product);
  const description = productDescription(product, statusDoc);

  const tableRows = rows.map((r) => {
    const statusLabel = !checkable ? 'Coming soon' : statusCopy(r.status);
    const statusClass = !checkable ? 'pending' : (r.status || 'unknown');
    return `<tr>
      <td><a href="/${product.id}/${r.region.code.toLowerCase()}">${escape(r.region.code)}: ${escape(r.region.name)}</a></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${r.lastIn ? `<time datetime="${escape(r.entry.lastInStock)}">${escape(r.lastIn)}</time>` : 'None recorded'}</td>
    </tr>`;
  }).join('');

  const modelPrices = (product.packages || []).filter((pkg) => prices?.[pkg.id]?.US);
  const breadcrumbs = breadcrumbsLd([{ name: 'Home', url: `${SITE}/` }, { name: product.name, url: canonical }]);
  const ld = productLd(product, baseOffers(product, statusDoc, prices, VALVE_SELLS));

  return `${shellHead({ title, description, canonical, robots: ROBOTS_INDEX, jsonLd: [ld, breadcrumbs] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/">← All products</a></p>
      <h1>${escape(product.name)} stock and availability by country</h1>
    </div>
  </header>

  <p class="intro">${escape(product.blurb)} ${checkable && statusDoc ? `In stock in <strong>${inStockCount}</strong> of ${soldIn.length} Steam countries at the last check.` : ''}</p>

  ${lastCheckHtml(statusDoc)}

  ${aff.block}

  <section class="results-section" aria-labelledby="countries-title">
    <h2 id="countries-title">Countries where Steam sells the ${escape(product.name)}</h2>
    <p>Steam sells Valve hardware in ${soldIn.length} countries: ${soldIn.map((r) => `<a href="/${product.id}/${r.code.toLowerCase()}">${escape(r.name)}</a>`).join(', ')}.${KOMODO_PRODUCTS[product.id] ? ' In Japan, South Korea, Hong Kong and Taiwan it is sold through Komodo, Valve\'s official distributor.' : ''} Other countries are listed below for reference.</p>
    ${modelPrices.length ? `<p>US prices on Steam: ${modelPrices.map((pkg) => `${escape(pkg.label || product.name)} ${escape(prices[pkg.id].US.formatted)}`).join(', ')}.</p>` : ''}
  </section>

  ${product.id === 'steam-deck' ? restockSection(product, history, statusDoc) : ''}

  <section class="results-section" aria-label="Per-country stock">
    <table class="history-table">
      <thead>
        <tr><th scope="col">Country</th><th scope="col">Status</th><th scope="col">Last in stock</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </section>

  <p class="intro" style="margin-top:24px"><a href="${escape(trackerUrl(product))}">Open in live tracker →</a> ${product.steamPath ? `· <a href="${escape(steamUrl(product))}" rel="noreferrer" target="_blank">Steam Store page →</a>` : ''}</p>

  ${shellFooter(aff.footer)}
</main>
${aff.tracker}
${ANALYTICS_BODY}
</body>
</html>`;
}

function regionTitle(product, region, current) {
  const short = seoFor(product).short;
  const name = region.name;
  if (soldOnSteam(region.code)) {
    const label = current ? statusCopy(current) : 'Stock Tracker';
    return fitTitle([`${short} Stock in ${name}: ${label}`, `${short} in ${name}: ${label}`, `${short} Stock in ${name}`]);
  }
  if (soldViaKomodo(product, region.code)) {
    return fitTitle([`${short} Stock in ${name}: Sold via Komodo`, `${short} in ${name}: Sold via Komodo`, `${short} in ${name}`]);
  }
  return fitTitle([`${short} in ${name}: Not Sold on Steam`, `${short} in ${name}: Not on Steam`, `${short} in ${name}`]);
}

function regionDescription(product, region, current, entry, prices) {
  const short = seoFor(product).short;
  const name = region.name;
  if (soldOnSteam(region.code)) {
    const base = priceRows(product, prices, region.code)[0];
    const required = [`${short} in ${name}: ${current ? statusCopy(current).toLowerCase() : 'stock status'} on the Steam Store.`];
    const optional = [];
    if (base) optional.push(`${base.pkg.label ? `The ${base.pkg.label}` : 'It'} costs ${base.price.formatted}.`);
    optional.push(entry?.lastInStock ? `Last in stock ${formatDay(entry.lastInStock)}.` : 'No restock recorded yet.');
    optional.push('Get a free restock alert.');
    return fitDescription(required, optional);
  }
  if (soldViaKomodo(product, region.code)) {
    return fitDescription([`${short} in ${name}: sold through Komodo, Valve's official distributor, not the Steam Store.`], ['Komodo stock status and links.']);
  }
  return fitDescription([`Steam does not sell the ${short} in ${name}. See the ${VALVE_SELLS.length} countries where Valve sells it on Steam.`], ['Stock for each one.']);
}

export function renderRegionPage(product, region, history, statusDoc, { affiliate, prices } = {}) {
  const aff = affiliateParts(product.id, affiliate);
  const canonical = `${SITE}/${product.id}/${region.code.toLowerCase()}`;
  const checkable = isCheckable(product);
  const entry = history?.[`${product.id}:${region.code}`];
  const current = checkable ? cellStatus(statusDoc, product, region.code) : null;
  const sold = soldOnSteam(region.code);
  const komodo = soldViaKomodo(product, region.code);
  const lastIn = entry?.lastInStock || null;

  const status = !checkable ? 'Coming soon' : (komodo ? 'Sold via Komodo' : statusCopy(current));
  const statusClass = !checkable ? 'pending' : (current || 'unknown');
  const title = regionTitle(product, region, current);
  const description = regionDescription(product, region, current, entry, prices);
  const robots = isIndexable(product, region.code) ? ROBOTS_INDEX : ROBOTS_NOINDEX;

  const priced = sold ? priceRows(product, prices, region.code) : [];
  const delivery = sold ? deliveryText(cell(statusDoc, product, region.code)) : null;
  const restocks = restockEvents(product, history, [region.code]).slice(0, 5);
  const others = PRODUCTS.filter((p) => p.id !== product.id);

  let body;
  if (sold) {
    body = `
    <p>Steam sells the ${escape(product.name)} in ${escape(region.name)}${current ? `, and at the last check it was <strong>${escape(statusCopy(current).toLowerCase())}</strong>` : ''}.</p>
    ${priced.length ? `<h2>${escape(product.name)} price in ${escape(region.name)}</h2>
    <table class="history-table"><thead><tr><th scope="col">Model</th><th scope="col">Steam price</th><th scope="col">Status</th></tr></thead><tbody>
      ${priced.map(({ pkg, price }) => {
        const pkgStatus = cell(statusDoc, product, region.code)?.packages?.find((p) => p.id === pkg.id)?.status;
        return `<tr><td>${escape(pkg.label || product.name)}</td><td>${escape(price.formatted)}</td><td>${escape(pkgStatus ? statusCopy(pkgStatus) : 'Not checked yet')}</td></tr>`;
      }).join('')}
    </tbody></table>` : ''}
    ${delivery ? `<p>Steam's delivery estimate for ${escape(region.name)}: ${escape(delivery)}.</p>` : ''}
    <h2>Restocks recorded in ${escape(region.name)}</h2>
    ${restocks.length ? `<ul>${restocks.map((e) => `<li><time datetime="${escape(e.ts)}">${escape(formatDay(e.ts))}</time></li>`).join('')}</ul>` : `<p>No restock of the ${escape(product.name)} in ${escape(region.name)} has been recorded yet.</p>`}`;
  } else if (komodo) {
    body = `
    <p>Steam does not sell the ${escape(product.name)} in ${escape(region.name)}. Valve sells it there through Komodo, its official distributor.</p>
    <p><a href="${escape(`${KOMODO_ORIGIN}${KOMODO_PRODUCTS[product.id]}`)}" rel="noreferrer" target="_blank">${escape(product.name)} on Komodo →</a> The live tracker checks Komodo stock for ${escape(region.name)}.</p>`;
  } else {
    body = `
    <p>Steam does not sell the ${escape(product.name)} in ${escape(region.name)}, and Valve has no official distributor there.</p>
    <p>Steam sells it in ${VALVE_SELLS.length} countries. See <a href="/${product.id}">${escape(product.name)} stock in every country</a>.</p>`;
  }

  const breadcrumbs = breadcrumbsLd([
    { name: 'Home', url: `${SITE}/` },
    { name: product.name, url: `${SITE}/${product.id}` },
    { name: region.name, url: canonical }
  ]);
  const ld = sold ? productLd(product, baseOffers(product, statusDoc, prices, [region.code])) : null;

  return `${shellHead({ title, description, canonical, robots, jsonLd: [ld, breadcrumbs] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/${escape(product.id)}">← ${escape(product.name)} (all countries)</a></p>
      <h1>${escape(product.name)} stock in ${escape(region.name)}</h1>
    </div>
  </header>

  <section class="results-section">
    <p class="intro"><span class="badge ${statusClass}" style="font-size:1rem;padding:6px 12px">${escape(status)}</span></p>

    ${lastCheckHtml(statusDoc)}

    ${aff.block}

    ${body}

    <dl class="result-grid" style="margin-top:16px">
      ${lastIn ? `<div><dt>Last in stock</dt><dd><time datetime="${escape(lastIn)}">${escape(formatDate(lastIn))}</time> (${escape(relativeTime(lastIn))})</dd></div>` : ''}
      ${entry?.lastOutOfStock ? `<div><dt>Last out of stock</dt><dd><time datetime="${escape(entry.lastOutOfStock)}">${escape(formatDate(entry.lastOutOfStock))}</time> (${escape(relativeTime(entry.lastOutOfStock))})</dd></div>` : ''}
    </dl>

    <p class="intro" style="margin-top:24px">
      ${sold && product.steamPath ? `<a href="${escape(steamUrl(product, region.code))}" rel="noreferrer" target="_blank">Buy on Steam (${escape(region.code)}) →</a> · ` : ''}<a href="${escape(trackerUrl(product, region.code))}">Open in live tracker →</a>
    </p>
  </section>

  <section class="results-section" aria-labelledby="others-title">
    <h2 id="others-title">Other Valve hardware in ${escape(region.name)}</h2>
    <ul>${others.map((p) => {
      const s = isCheckable(p) ? cellStatus(statusDoc, p, region.code) : null;
      const label = soldViaKomodo(p, region.code) ? 'Sold via Komodo' : statusCopy(s);
      return `<li><a href="/${p.id}/${region.code.toLowerCase()}">${escape(p.name)}</a>: ${escape(label)}</li>`;
    }).join('')}</ul>
  </section>

  ${shellFooter(aff.footer)}
</main>
${aff.tracker}
${ANALYTICS_BODY}
</body>
</html>`;
}
