import { REGIONS, VALVE_SELLS, PRODUCTS, isCheckable } from './products.mjs';
import StockStatus from '../public/stock-status.js';
import { explainerFor, VERIFIED_ON } from './explainers.mjs';
import { ANALYTICS_HEAD, ANALYTICS_BODY, CONSENT_LINK } from './analytics.mjs';
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
<link rel="manifest" href="/site.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
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
  return `<footer class="site-footer"><div class="footer-inner"><a href="/">Tracker</a> · <a href="/history">History</a> · <a href="/how-it-works">How it works</a> · <a href="/methodology">Methodology</a> · <a href="/about">About</a> · <a href="/disclosures">Disclosures</a> · <a href="https://github.com/rfsbraz/steamhardwarestock">GitHub</a> · ${CONSENT_LINK}${disclosure ? ` ${disclosure}` : ''}</div></footer>`;
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

function explainerSection(product) {
  const e = explainerFor(product);
  if (!e) return '';
  return `<section class="results-section" id="status-explained" aria-labelledby="status-explained-title">
    <h2 id="status-explained-title">What the status means for the ${escape(product.name)}</h2>
    <p>${escape(e.summary)}</p>
    <ul>${e.points.map((t) => `<li>${escape(t)}</li>`).join('')}</ul>
    <p>Source: <a href="${escape(e.source)}" rel="noreferrer" target="_blank">Valve's ${escape(product.name)} page on Steam</a>, checked ${escape(formatDay(`${VERIFIED_ON}T12:00:00Z`))}. Valve's page is the final word if the two differ. <a href="/how-it-works">How this tracker works</a>.</p>
  </section>`;
}

const HOW_STATUSES = ['in_stock', 'reservation_open', 'waitlist', 'out_of_stock', 'unavailable_in_region'];
const HOW_MEANING = {
  in_stock: 'Steam reports units you can buy now in that country.',
  reservation_open: 'Steam takes reservations. You are emailed when you can place the order.',
  waitlist: 'Steam has a queue and you would join the back of it. You get a chance to buy only after the people ahead of you.',
  out_of_stock: 'Steam sells it in that country but shows no units right now.',
  unavailable_in_region: 'Steam does not sell this product in that country.'
};

const STEAM_FIELDS = [
  ['allow_purchase_in_country', 'false means Steam does not sell the product in that country: Not sold here.'],
  ['requires_reservation', 'true means the product is sold through reservations. Then reservation_not_allowed, position_is_waitlist, queue_in_waitlist and high_pending_orders decide between Reservations open, Waitlist and Out of stock.'],
  ['high_pending_orders', 'true on a normal product means Steam has turned the buy button off while it works through orders: Out of stock.'],
  ['account_restricted_from_purchasing', 'true means Steam is not selling it right now: Out of stock.'],
  ['inventory_available', 'true, when none of the above apply, means In stock. Anything else is Out of stock.']
];

// Plain information pages, prerendered to /<path>/index.html and listed in
// the sitemap. Keep the copy short and written for this site.
export const INFO_PAGES = [
  {
    path: '/how-it-works',
    title: 'How it works: Steam Hardware Stock Tracker',
    heading: 'How the tracker works',
    description: 'Where the stock data comes from, how often it is checked, and what each status means for Steam Deck, Frame, Machine, Controller and Dock.',
    body: () => `<section class="results-section" aria-labelledby="source-title">
    <h2 id="source-title">Where the data comes from</h2>
    <p>The only source is the Steam store itself. A small job asks Steam for the stock of every Valve hardware product in every country where Steam sells it, every 10 minutes. It uses the same public store data the Steam website uses. Nothing comes from resellers, rumours or user reports.</p>
    <p>Each country is checked on its own, because Steam stocks, prices and queues are per country. When a status changes, the change is saved to the stock history and the product pages are rebuilt.</p>
    <p>In Japan, South Korea, Hong Kong and Taiwan, Valve sells some hardware through Komodo, its official distributor, instead of the Steam store. Those pages link to Komodo.</p>
  </section>

  <section class="results-section" aria-labelledby="statuses-title">
    <h2 id="statuses-title">What each status means</h2>
    <dl>${HOW_STATUSES.map((st) => `<dt><span class="badge ${st}">${escape(statusCopy(st))}</span></dt><dd>${escape(HOW_MEANING[st])}</dd>`).join('')}</dl>
    <p>Reservations and waitlists work differently for each product. Each product page has a short explanation, with a link to Valve's own page.</p>
  </section>

  <section class="results-section" aria-labelledby="limits-title">
    <h2 id="limits-title">What it cannot tell you</h2>
    <ul>
      <li>Your own place in a reservation queue or waitlist. Only your Steam account shows that.</li>
      <li>Stock that appears and sells out between two checks.</li>
      <li>Shipping dates. Steam shows those at checkout.</li>
    </ul>
    <p>Prices are Steam's local prices from the last build. When Steam gives no price for a country, no price is shown.</p>
  </section>

  <section class="results-section" aria-labelledby="alerts-title">
    <h2 id="alerts-title">Alerts</h2>
    <p>The <a href="/">live tracker</a> can watch the products and countries you pick and alert you in the browser when one changes. The alert works while the tracker is open in a tab. You can also install the site as an app from your browser menu.</p>
  </section>`
  },
  {
    path: '/about',
    title: 'About the Steam Hardware Stock Tracker',
    heading: 'About this tracker',
    description: 'Who runs the Steam Hardware Stock Tracker, why it exists, and how it is paid for. An independent, open source project.',
    body: () => `<section class="results-section" aria-labelledby="who-title">
    <h2 id="who-title">Who runs it</h2>
    <p>The Steam Hardware Stock Tracker is a small independent project by Rodrigo Braz. It started as a way to stop refreshing the Steam Deck page by hand, and grew to cover every piece of Valve hardware sold on Steam. It is not affiliated with Valve, and Steam and the product names are Valve's trademarks.</p>
    <p>The code is open source on <a href="https://github.com/rfsbraz/steamhardwarestock" rel="noreferrer" target="_blank">GitHub</a>. Anyone can read how a status is worked out, report a mistake or suggest a change. Bug reports and corrections go to the <a href="https://github.com/rfsbraz/steamhardwarestock/issues" rel="noreferrer" target="_blank">issue tracker</a>.</p>
  </section>
  <section class="results-section" aria-labelledby="why-title">
    <h2 id="why-title">Why it exists</h2>
    <p>New Valve hardware tends to sell out, or go to reservations, within minutes. Resellers then charge far more for the same unit. The best defence is knowing the moment Steam has stock or opens reservations in your own country, so you can buy at the official price. The tracker shows that for every country at once, keeps a history of past restocks, and can alert you in your browser.</p>
  </section>
  <section class="results-section" aria-labelledby="money-title">
    <h2 id="money-title">How it is paid for</h2>
    <p>Hosting is on free plans. Some pages may show accessory links that earn a small commission, and there is an optional tip link. None of this changes what a status says. The <a href="/disclosures">disclosures page</a> has the details.</p>
  </section>`
  },
  {
    path: '/methodology',
    title: 'Methodology: how Steam stock is checked',
    heading: 'Methodology',
    description: 'How the tracker reads Steam store data, which fields decide each status, how often it checks, and the known limits of the data.',
    body: () => `<section class="results-section" aria-labelledby="cadence-title">
    <h2 id="cadence-title">Source and schedule</h2>
    <p>A scheduled job asks the Steam store for every hardware package in each of the ${VALVE_SELLS.length} countries where Valve sells on Steam, every 10 minutes. It makes one request per country with all packages in it. The answers are stored together with the time of the check. Nothing is estimated or filled in by hand.</p>
    <p>Prices come from the Steam store as well, at build time. A price is only shown when its format matches the store currency for that country, so a page never shows a guessed currency.</p>
  </section>
  <section class="results-section" aria-labelledby="fields-title">
    <h2 id="fields-title">How a status is decided</h2>
    <p>Each package gets a status from the fields Steam returns, checked in this order:</p>
    <ul>${STEAM_FIELDS.map(([f, t]) => `<li><code>${f}</code>: ${escape(t)}</li>`).join('')}</ul>
    <p>A product with several models takes the best status of its models. In stock beats Reservations open, which beats Waitlist. The rules are in <code>public/stock-status.js</code> in the source code.</p>
  </section>
  <section class="results-section" aria-labelledby="history-title">
    <h2 id="history-title">History and freshness</h2>
    <p>A change is only recorded when the status differs from the last one for that product and country, so the history lists real transitions, not every check. Product pages are rebuilt after a change. Each page shows the time of the last check, and the history keeps the latest 50 changes per product and country.</p>
  </section>
  <section class="results-section" aria-labelledby="limits-m-title">
    <h2 id="limits-m-title">Known limits</h2>
    <ul>
      <li>Stock that appears and sells out between two checks is missed.</li>
      <li>If Steam does not answer for a country, that country has no current status until the next check that works. Its history is kept.</li>
      <li>Steam does not say where you are in a queue, so the tracker cannot either.</li>
      <li>Komodo stock in Japan, South Korea, Hong Kong and Taiwan is not checked. Those pages link to Komodo.</li>
    </ul>
  </section>`
  },
  {
    path: '/disclosures',
    title: 'Disclosures: affiliate links, analytics and consent',
    heading: 'Disclosures',
    description: 'How the tracker earns money from affiliate links, what analytics it uses, and how consent works. Not affiliated with Valve.',
    body: ({ affiliate = NO_AFFILIATE } = {}) => {
      const jsaux = Boolean(affiliate.jsaux?.refId);
      const amazon = Boolean(affiliate.amazon?.enabled && affiliate.amazon?.tag);
      const aff = jsaux || amazon
        ? `<p>Some product pages show accessory links${jsaux ? ' to JSAUX' : ''}${jsaux && amazon ? ' and' : ''}${amazon ? ' to Amazon' : ''}. These are affiliate links. If you buy through one, the tracker may earn a commission at no extra cost to you.${amazon ? ' As an Amazon Associate I earn from qualifying purchases.' : ''} They are marked as sponsored and sit under the stock status, never inside it. A click on one is counted in analytics, following your consent choice below.</p>`
        : '<p>The site shows no affiliate links at the moment. If it adds accessory links, for example to JSAUX, they will be marked next to the links and in the footer, and this page will say so.</p>';
      return `<section class="results-section" aria-labelledby="aff-title">
    <h2 id="aff-title">Affiliate links and tips</h2>
    ${aff}
    <p>No partner pays for a status, a ranking or a mention. Statuses come only from the Steam store.</p>
    <p>There is also an optional "Buy me a coffee" tip link. Tips do not change anything on the site.</p>
  </section>
  <section class="results-section" aria-labelledby="analytics-title">
    <h2 id="analytics-title">Analytics and consent</h2>
    <p>The site uses Google Analytics with Google Consent Mode v2, and Cloudflare Web Analytics.</p>
    <ul>
      <li>In the EEA, the UK and Switzerland, Google Analytics starts with storage denied and sets no cookies until you accept. Elsewhere it starts allowed, and you can turn it off.</li>
      <li>Your choice is kept in your browser and applied before anything is sent.</li>
      <li>Cloudflare Web Analytics sets no cookies and collects no personal data.</li>
      <li>Your watch list and alert settings stay in your browser. There are no accounts.</li>
    </ul>
    <p><a href="#privacy-choices" data-consent-settings>Change your privacy choices</a> at any time. The same link is in every footer.</p>
  </section>
  <section class="results-section" aria-labelledby="valve-title">
    <h2 id="valve-title">Independence</h2>
    <p>This tracker is not affiliated with Valve. Steam, Steam Deck, Steam Frame, Steam Machine and Steam Controller are trademarks of Valve Corporation. For anything about your order, contact Steam Support.</p>
  </section>`;
    }
  }
];

export function renderInfoPage(page, ctx = {}) {
  const canonical = `${SITE}${page.path}`;
  const crumbs = breadcrumbsLd([{ name: 'Home', url: `${SITE}/` }, { name: page.heading, url: canonical }]);
  return `${shellHead({ title: page.title, description: page.description, canonical, robots: ROBOTS_INDEX, jsonLd: [crumbs] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/">← All products</a></p>
      <h1>${escape(page.heading)}</h1>
    </div>
  </header>

  ${page.body(ctx)}

  ${shellFooter()}
</main>
${ANALYTICS_BODY}
</body>
</html>`;
}

export function renderHowItWorks() {
  return renderInfoPage(INFO_PAGES[0]);
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

  ${explainerSection(product)}

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
