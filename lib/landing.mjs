import { REGIONS, VALVE_SELLS, PRODUCTS, isCheckable } from './products.mjs';
import { FEED_LINKS } from './feed.mjs';
import StockStatus from '../public/stock-status.js';
import { availabilityFor, AVAILABILITY } from './availability.mjs';
import { productFaq, regionFaq, faqHtml, faqLd } from './faq.mjs';
import { STATUS_PAGE_PRODUCTS } from './status-products.mjs';
import { explainerFor, VERIFIED_ON } from './explainers.mjs';
import { statusText } from './parts.mjs';
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
export function affiliateParts(productId, config = NO_AFFILIATE) {
  const block = Affiliate.accessoryBlock(productId, config);
  const footer = Affiliate.footerDisclosure(config);
  const promo = block.includes('class="deal-promo"') ? `(${Affiliate.hideEndedPromos.toString()})(document, Date.now());` : '';
  const tracker = block ? `<script>(${Affiliate.installClickTracking.toString()})(document, window);${promo}</script>` : '';
  return { block, footer, tracker };
}

export function escape(s) {
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

export function statusCopy(status) {
  return status ? StockStatus.copyFor(status).label : 'Not checked yet';
}

export function lastCheckHtml(statusDoc) {
  if (!statusDoc?.generatedAt) return '<p class="intro">Last check: not checked yet.</p>';
  return `<p class="intro">Last check: <time datetime="${escape(statusDoc.generatedAt)}">${escape(formatDate(statusDoc.generatedAt))}</time>.</p>`;
}

// One line on how fresh the data is and where it comes from. The time is the
// build's check; CHECKED_SCRIPT turns it into "N min ago" and moves it to the
// newer check in /status.json.
export function trustStrip(statusDoc) {
  const at = statusDoc?.generatedAt;
  const when = at
    ? `<b>Checked <time class="checked-ago" datetime="${escape(at)}" title="${escape(formatDate(at))}">${escape(new Date(at).toUTCString().slice(17, 22))} GMT</time></b>`
    : '<b>Not checked yet</b>';
  return `<div class="trust" role="note"><span><span class="dot"></span>${when}</span><span>Every 10 minutes, all ${VALVE_SELLS.length} Steam countries</span><span>Source: Steam store</span><span><a href="/methodology">Methodology</a> · <a href="https://github.com/rfsbraz/steamhardwarestock">Open source</a></span></div>`;
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

export function shellHead({ title, description, canonical, robots, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${ANALYTICS_HEAD}
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
${canonical ? `<link rel="canonical" href="${escape(canonical)}">\n` : ''}<meta name="robots" content="${robots}">
<meta name="theme-color" content="#202124">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/site.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${FEED_LINKS}
<link rel="preconnect" href="https://clan.akamai.steamstatic.com">
<link rel="preconnect" href="https://clan.fastly.steamstatic.com">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Steam Hardware Stock Tracker">
${canonical ? `<meta property="og:url" content="${escape(canonical)}">\n` : ''}<meta property="og:title" content="${escape(title)}">
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

export const ROBOTS_INDEX = 'index,follow,max-image-preview:large,max-snippet:-1';
const ROBOTS_NOINDEX = 'noindex,follow';

export function shellFooter(disclosure = '') {
  return `<footer class="site-footer"><div class="footer-inner"><a href="/">Tracker</a> · <a href="/history">History</a> · <a href="/how-it-works">How it works</a> · <a href="/methodology">Methodology</a> · <a href="/about">About</a> · <a href="/disclosures">Disclosures</a> · <a href="https://github.com/rfsbraz/steamhardwarestock">GitHub</a> · ${CONSENT_LINK}${disclosure ? ` ${disclosure}` : ''}</div></footer>`;
}

export function breadcrumbsLd(crumbs) {
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
    <p>Source: <a href="${escape(e.source)}" rel="noreferrer" target="_blank">Valve's ${escape(product.name)} page on Steam</a>. These notes were last compared with Valve's page on ${escape(formatDay(`${e.verifiedOn || VERIFIED_ON}T12:00:00Z`))}. Stock is checked every 10 minutes. Valve's page is the final word if the two differ. <a href="/how-it-works">How this tracker works</a>.</p>${e.update ? `\n    <p>Also see Valve's update <a href="${escape(e.update.url)}" rel="noreferrer" target="_blank">${escape(e.update.title)}</a> from ${escape(formatDay(`${e.update.date}T12:00:00Z`))}.</p>` : ''}
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
  ['account_restricted_from_purchasing', 'true means Steam is not selling it right now: Out of stock.'],
  ['inventory_available', 'true, when none of the above apply, means In stock.'],
  ['high_pending_orders', 'true means Steam sees high demand. While there is inventory the item stays In stock and Steam still shows Buy now. Without inventory it is Out of stock, as is anything not covered above.']
];

// Plain information pages, prerendered to <path>.html (served at /<path>) and listed in
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
    description: 'Who runs the Steam Hardware Stock Tracker, why it exists, and how it is paid for. An independent, open source project, not affiliated with Valve.',
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
        ? `<p>Some product pages show accessory links${jsaux ? ' to JSAUX' : ''}${jsaux && amazon ? ' and' : ''}${amazon ? ' to Amazon' : ''}. These are affiliate links. If you buy through one, the tracker may earn a commission at no extra cost to you.${amazon ? ' As an Amazon Associate I earn from qualifying purchases.' : ''} They are marked as sponsored and sit under the stock status, never inside it. A click on one is counted in analytics, following your consent choice below.</p>${jsaux ? `
    <p>JSAUX accessories show as small product cards marked Ad, with a picture and a price. The prices come from jsaux.com in USD when the site is built, at least once a day, so they can lag behind the store. The date they were checked is under the cards. If the price feed can't be read, plain links show instead.</p>` : ''}`
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

// dist/404.html. Cloudflare Pages serves it with a 404 status for any path
// no file matches. Without it Pages falls back to index.html with a 200, so
// /faq or /status looked like the homepage (a soft 404). No canonical: the
// page has no URL of its own.
export function renderNotFoundPage() {
  const links = PRODUCTS.map((p) => `<li><a href="/${p.id}">${escape(p.name)}</a></li>`).join('');
  return `${shellHead({ title: 'Page not found | Steam Hardware Stock Tracker', description: 'This page does not exist. Check Steam Deck, Steam Controller, Steam Frame and Steam Machine stock from the tracker instead.', canonical: null, robots: ROBOTS_NOINDEX, jsonLd: [] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/">← All products</a></p>
      <h1>Page not found</h1>
    </div>
  </header>

  <section class="results-section">
    <p>There is no page at this address. It may have moved, or the link may be wrong.</p>
    <p>The <a href="/">live tracker</a> shows current stock in every country. Each product also has its own page:</p>
    <ul>${links}</ul>
  </section>

  ${shellFooter()}
</main>
${ANALYTICS_BODY}
</body>
</html>`;
}

export function renderHowItWorks() {
  return renderInfoPage(INFO_PAGES[0]);
}

// Lowest local price for a row, or '' when Steam gave none for that country.
function rowPrice(product, prices, cc) {
  const rows = priceRows(product, prices, cc).sort((a, b) => a.price.amount - b.price.amount);
  if (!rows.length) return '';
  return `${rows.length > 1 ? 'from ' : ''}${rows[0].price.formatted}`;
}

// Rows show the absolute check time from the build. In the browser this
// turns it into "N min ago", and moves it to the newer generatedAt from
// /status.json, since the pages are only rebuilt when a status changes.
// A time with no data-cell (the trust strip) always moves to the newer check.
export const CHECKED_SCRIPT = `<script>(function(){function up(){var n=Date.now();document.querySelectorAll('time.checked-ago').forEach(function(t){var d=Date.parse(t.dateTime);if(isNaN(d))return;var m=Math.max(0,Math.floor((n-d)/60000));t.textContent=m<1?'just now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' h ago':Math.floor(m/1440)+' d ago';});}up();setInterval(up,60000);if(typeof fetch==='function')fetch('/status.json').then(function(r){return r.ok?r.json():null;}).then(function(doc){if(!doc||isNaN(Date.parse(doc.generatedAt)))return;document.querySelectorAll('time.checked-ago').forEach(function(t){var a=t.getAttribute('data-cell'),k=(a||'').split(':');var c=!a||(doc.products&&doc.products[k[0]]&&doc.products[k[0]][k[1]]);if(c&&Date.parse(doc.generatedAt)>Date.parse(t.dateTime)){t.dateTime=doc.generatedAt;t.title=new Date(doc.generatedAt).toUTCString();}});up();}).catch(function(){});})();</script>`;
function priceRows(product, prices, cc) {
  return (product.packages || [])
    .map((pkg) => ({ pkg, price: prices?.[pkg.id]?.[cc] }))
    .filter((r) => r.price);
}

// 30-day timeline: one track per country showing when Steam had stock, from
// the history events. EU countries with the same pattern share one row.
const DAY_MS = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (ms) => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const isIn = (e) => e.status === 'in_stock' || (!e.status && e.available === true);

function stockSpans(events, from, to) {
  const asc = (events || []).filter((e) => e?.ts && !isNaN(Date.parse(e.ts))).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const spans = [];
  let open = null;
  for (const e of asc) {
    const t = Date.parse(e.ts);
    if (t > to) break;
    if (isIn(e)) { if (open === null) open = t; } else if (open !== null) { spans.push([open, t]); open = null; }
  }
  if (open !== null) spans.push([open, to]);
  return spans.filter(([, b]) => b > from).map(([a, b]) => ({ a: Math.max(a, from), b, restock: a >= from }));
}

function restockTimeline(product, history, statusDoc) {
  const events = (cc) => history?.[`${product.id}:${cc}`]?.events || [];
  const to = Date.parse(statusDoc?.generatedAt || '') || Math.max(0, ...VALVE_SELLS.flatMap((cc) => events(cc).map((e) => Date.parse(e.ts) || 0)));
  if (!to || !VALVE_SELLS.some((cc) => events(cc).length)) return '<p>No stock history has been recorded yet.</p>';
  const from = to - 30 * DAY_MS;
  const per = VALVE_SELLS.map((cc) => ({ cc, spans: stockSpans(events(cc), from, to) }));
  const sig = (r) => r.spans.map((x) => `${x.a}-${x.b}`).join(',');
  const euSigs = {};
  for (const r of per) if (!NOT_EU.includes(r.cc)) (euSigs[sig(r)] ||= []).push(r.cc);
  const rows = [];
  const done = new Set();
  for (const r of per) {
    if (done.has(r.cc)) continue;
    const same = NOT_EU.includes(r.cc) ? [r.cc] : euSigs[sig(r)];
    same.forEach((cc) => done.add(cc));
    rows.push({ codes: same, spans: r.spans });
  }
  const span = to - from;
  const label = (codes) => (codes.length > 1 ? `${codes.length} EU countries` : REGION_NAME[codes[0]] || codes[0]);
  const name = (row) => row.codes.length > 1
    ? `<span class="tl-name" title="${escape(row.codes.map((cc) => REGION_NAME[cc] || cc).join(', '))}">${label(row.codes)} <span class="small">(same pattern)</span></span>`
    : `<span class="tl-name"><a href="/${product.id}/${row.codes[0].toLowerCase()}">${escape(label(row.codes))}</a></span>`;
  const bars = (row) => row.spans.map((x) => `<i style="left:${((x.a - from) / span * 100).toFixed(2)}%;width:${Math.max(0.6, (x.b - x.a) / span * 100).toFixed(2)}%" title="${shortDay(x.a)} ${hhmm(x.a)} to ${shortDay(x.b)} ${hhmm(x.b)} GMT"></i>`).join('');
  const now = (row) => {
    const st = cellStatus(statusDoc, product, row.codes[0]);
    return `<span class="now"><span class="badge ${st || 'unknown'}">${escape(statusCopy(st))}</span></span>`;
  };
  const note = (row) => {
    const restocks = row.spans.filter((x) => x.restock);
    if (restocks.length) return `${escape(label(row.codes))}: ${restocks.length} ${restocks.length === 1 ? 'restock' : 'restocks'}, most recently ${shortDay(restocks.at(-1).a)}.`;
    if (row.spans.length) return `${escape(label(row.codes))}: in stock the whole time.`;
    const last = row.codes.map((cc) => history?.[`${product.id}:${cc}`]?.lastInStock).filter(Boolean).sort().at(-1);
    return `${escape(label(row.codes))}: none, ${last ? `last in stock ${escape(formatDay(last))}` : 'no stock recorded'}.`;
  };
  return `<div class="tl"><span></span><div class="axis"><span>${shortDay(from)}</span><span>${shortDay((from + to) / 2)}</span><span>${shortDay(to)}</span></div><span></span>
      ${rows.map((row) => `${name(row)}<div class="track">${bars(row)}</div>${now(row)}`).join('\n      ')}
    </div>
    <p class="tl-legend"><i></i>In stock. Restocks in the last 30 days: ${rows.map(note).join(' ')}</p>`;
}

function restockSection(product, history, statusDoc) {
  const inStockNow = VALVE_SELLS.filter((cc) => cellStatus(statusDoc, product, cc) === 'in_stock');
  return `<section class="results-section" id="restock" aria-labelledby="restock-title">
    <h2 id="restock-title">${escape(product.name)} restock tracker</h2>
    <p>Valve does not announce ${escape(product.name)} restocks in advance. This page reads the Steam Store every 10 minutes in the ${VALVE_SELLS.length} countries where Steam sells hardware, and records each time a country goes from out of stock to in stock.</p>
    <p>${inStockNow.length ? `In stock now in ${inStockNow.length} ${inStockNow.length === 1 ? 'country' : 'countries'}: ${inStockNow.map((cc) => escape(REGION_NAME[cc])).join(', ')}.` : 'Not in stock in any Steam country at the last check.'}</p>
    <h3>Last 30 days</h3>
    ${restockTimeline(product, history, statusDoc)}
    <p>A restock here means Steam reported inventory for the country. When Steam shows a pending order queue, the buy button can stay off even with stock, so a restock can sell out within minutes.</p>
  </section>`;
}

const PSU_LINK = '<a href="/steam-hardware-power-supply">Steam Hardware Power Supply Unit stock by country →</a>';
const ACCESSORY_LINKS = {
  'steam-frame': `<p>The Steam Frame ships without a power supply. ${PSU_LINK}</p>
    <p>Spare face gasket, head cushion and light blocker: <a href="/steam-frame-replacement-kit">Steam Frame Replacement Kit stock by country →</a></p>`,
  'steam-deck': `<p>Need a charger? Valve sells its 45W USB-C power supply on its own. ${PSU_LINK}</p>`
};

// One row per part: its US price and how many countries have it in stock.
function partsSection(product, statusDoc, prices) {
  const rows = product.packages.map((pkg) => {
    const n = VALVE_SELLS.filter((cc) => cell(statusDoc, product, cc)?.packages?.find((p) => p.id === pkg.id)?.status === 'in_stock').length;
    return `<tr><td>${escape(pkg.label)}</td><td class="price">${escape(prices?.[pkg.id]?.US?.formatted || '')}</td><td>In stock in ${n} of ${VALVE_SELLS.length} countries</td></tr>`;
  }).join('');
  return `<section class="results-section" id="parts" aria-labelledby="parts-title">
    <h2 id="parts-title">Remaining parts</h2>
    <p>Each part sells out on its own. A country counts as in stock above when at least one part is.</p>
    <div class="history-table-wrap">
    <table class="history-table"><thead><tr><th scope="col">Part</th><th scope="col">US price</th><th scope="col">Stock</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </section>`;
}

// The dock has been out of stock for months, so people ask whether Valve
// stopped making it. Valve has not said so; this answers with what Steam shows.
const NOT_EU = ['US', 'CA', 'GB', 'AU'];
const lastInStock = (product, history, codes) => codes
  .map((cc) => ({ cc, ts: history?.[`${product.id}:${cc}`]?.lastInStock }))
  .filter((e) => e.ts)
  .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
const dayHtml = (ts) => `<time datetime="${escape(ts)}">${escape(formatDay(ts))}</time>`;

// Steam countries that list the product: Valve's hardware countries minus
// any where Steam does not sell this product.
const listedIn = (product, statusDoc) => VALVE_SELLS.filter((cc) => cellStatus(statusDoc, product, cc) !== 'unavailable_in_region');

// One product's state across the countries that list it, short enough for a
// card badge: "In stock in 29 of 31", "Out of stock in all 30".
export function cardStatus(product, statusDoc) {
  const listed = listedIn(product, statusDoc).filter((cc) => statusDoc?.products?.[product.id]?.[cc]);
  const n = (s) => listed.filter((cc) => cellStatus(statusDoc, product, cc) === s).length;
  const total = listed.length;
  const [inStock, waitlist, reserve, out] = [n('in_stock'), n('waitlist'), n('reservation_open'), n('out_of_stock')];
  if (!total) return { cls: 'unknown', text: 'Not checked yet' };
  if (inStock) return { cls: 'in_stock', text: `In stock in ${inStock} of ${total}` };
  if (waitlist && reserve) return { cls: 'reservation_open', text: `Waitlist in ${waitlist}, reservations in ${reserve} of ${total}` };
  if (reserve) return { cls: 'reservation_open', text: `Reservations open in ${reserve} of ${total}` };
  if (waitlist) return { cls: 'waitlist', text: `Waitlist in ${waitlist} of ${total}` };
  if (out) return { cls: 'out_of_stock', text: out === total ? `Out of stock in all ${total}` : `Out of stock in ${out} of ${total}` };
  return { cls: 'unknown', text: 'Not checked yet' };
}

// Linked status cards, one per product.
export function productCards(products, statusDoc, { label = 'All products' } = {}) {
  const cards = products.map((p) => {
    const st = cardStatus(p, statusDoc);
    return pcard({ href: `/${p.id}`, icon: p.icon, name: p.name, badge: st });
  }).join('');
  return `<section class="pcards-wrap" aria-label="${escape(label)}"><div class="pcards">${cards}</div></section>`;
}

function pcard({ href, icon, name, why, badge }) {
  return `<a class="pcard" href="${escape(href)}"><img src="${escape(icon)}" alt="" width="56" height="36" loading="lazy"><span><span class="nm">${escape(name)}</span>${why ? `<span class="why">${escape(why)}</span>` : ''}${badge ? `<span class="st"><span class="badge ${badge.cls}">${escape(badge.text)}</span></span>` : ''}</span></a>`;
}

// What people open next from a product page. Products get their live status
// across countries; plain pages get no badge.
const RELATED = {
  'steam-deck': [
    { id: 'steam-dock', why: 'The official dock' },
    { id: 'steam-deck-refurbished', why: 'Cheaper, when Valve has it' },
    { id: 'steam-hardware-power-supply', why: 'Spare 45W charger' },
    { href: '/steam-deck-black-friday', name: 'Steam Deck Black Friday', icon: 'steam-deck', why: 'Stock and prices for Black Friday and the Winter Sale' }
  ]
};

function relatedSection(product, statusDoc) {
  const items = RELATED[product.id];
  if (!items) return '';
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const cards = items.map((r) => {
    if (r.href) return pcard({ href: r.href, icon: byId(r.icon).icon, name: r.name, why: r.why });
    const p = byId(r.id);
    return pcard({ href: `/${p.id}`, icon: p.icon, name: p.name, why: r.why, badge: cardStatus(p, statusDoc) });
  }).join('');
  return `<section class="results-section" aria-labelledby="related-title">
    <h2 id="related-title">Often checked with the ${escape(product.name)}</h2>
    <div class="pcards">${cards}</div>
  </section>`;
}

// The saved country, else the region of the browser language, when Steam
// sells the product there. Runs in the browser through toString(), so plain ES5.
export function pickCountry(saved, languages, codes) {
  if (saved && codes.indexOf(saved) !== -1) return saved;
  for (var i = 0; i < (languages || []).length; i++) {
    var m = /-([A-Za-z]{2})$/.exec(languages[i] || '');
    if (m && codes.indexOf(m[1].toUpperCase()) !== -1) return m[1].toUpperCase();
  }
  return '';
}

// Preselects every country select and remembers a change, so the next
// product page starts with the same country. Also shows that country's
// panel in the status summary.
const COUNTRY_SCRIPT = `<script>(function(pick){var K='shs-country',saved=null;try{saved=localStorage.getItem(K);}catch(e){}document.querySelectorAll('select[data-country]').forEach(function(s){var codes=[].map.call(s.options,function(o){return o.value;}).filter(Boolean);var cc=pick(saved,navigator.languages||[navigator.language],codes);if(cc)s.value=cc;show(s.value);s.addEventListener('change',function(){try{localStorage.setItem(K,s.value);}catch(e){}show(s.value);});});function show(cc){var on=false;document.querySelectorAll('[data-yc]').forEach(function(p){p.hidden=p.getAttribute('data-yc')!==cc;if(!p.hidden)on=true;});document.querySelectorAll('.hero-yc').forEach(function(w){w.hidden=!on;w.parentNode.classList.toggle('has-yc',on);});}})(${pickCountry.toString()});</script>`;

// Delegated listeners for the ways to start watching a product from the alert
// box: the RSS link (channel rss) and the form that opens the tracker in a tab
// (channel tab, sent on submit so a button press counts once). Same shape as
// the affiliate_click tracker, and self-contained so the product pages can
// inline it with toString().
export function installAlertTracking(doc, win) {
  function send(el) {
    if (!el || typeof win.gtag !== 'function') return;
    win.gtag('event', 'alert_subscribe', {
      product: el.getAttribute('data-product'),
      channel: el.getAttribute('data-alert'),
      source: 'product_page'
    });
  }
  doc.addEventListener('click', function (event) {
    try {
      var target = event.target;
      send(target && target.closest ? target.closest('a[data-alert]') : null);
    } catch (_) {
      // Tracking must never block the click.
    }
  });
  doc.addEventListener('submit', function (event) {
    try {
      var target = event.target;
      send(target && target.closest ? target.closest('form[data-alert]') : null);
    } catch (_) {
      // Tracking must never block the form.
    }
  });
}

const ALERT_SCRIPT = `<script>(${installAlertTracking.toString()})(document, window);</script>`;

function alertHeading(product, statusDoc) {
  const statuses = listedIn(product, statusDoc).map((cc) => cellStatus(statusDoc, product, cc));
  if (statuses.includes('in_stock')) return `Get a ${product.name} stock alert for your country`;
  if (statuses.includes('reservation_open') || statuses.includes('waitlist')) return `Get an alert when ${product.name} reservations open`;
  return `Get an alert when the ${product.name} is back`;
}

// The form submits to /?p=<product>&r=<country>, the link app.js already reads.
function alertBox(product, statusDoc) {
  const options = listedIn(product, statusDoc)
    .map((cc) => ({ cc, name: REGION_NAME[cc] || cc }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((o) => `<option value="${escape(o.cc)}">${escape(o.name)}</option>`).join('');
  return `<section class="alert-box" aria-labelledby="alert-title">
    <div><h2 id="alert-title">${escape(alertHeading(product, statusDoc))}</h2>
    <p>Opens the tracker with the ${escape(product.name)} and your country already ticked. <a href="/rss.xml" data-alert="rss" data-product="${escape(product.id)}">Or follow the RSS feed</a>.</p></div>
    <form action="/" method="get" data-alert="tab" data-product="${escape(product.id)}"><input type="hidden" name="p" value="${escape(product.id)}"><select name="r" aria-label="Your country" data-country><option value="">Choose your country</option>${options}</select><button type="submit">Alert me</button></form>
  </section>`;
}

// Steam's estimated date for the next order emails, as "January 2027".
// rtime_estimated_notification is in seconds; 0 means Steam gave none.
function orderWindow(c) {
  const t = c?.packages?.[0]?.details?.rtime_estimated_notification;
  return t > 0 ? new Date(t * 1000).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
}

// The month most listed countries share.
function commonWindow(product, statusDoc, codes) {
  const n = {};
  for (const cc of codes) {
    const w = orderWindow(cell(statusDoc, product, cc));
    if (w) n[w] = (n[w] || 0) + 1;
  }
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;
}

const OUT_LIST_MAX = 8;
const pct = (n, of) => (of ? (n / of) * 100 : 0);

function heroNow(product, history, statusDoc, listed) {
  const by = (st) => listed.filter((cc) => cellStatus(statusDoc, product, cc) === st);
  const inStock = by('in_stock');
  const reserve = by('reservation_open');
  const waitlist = by('waitlist');
  const queued = reserve.length + waitlist.length;
  const total = listed.length;
  const name = (cc) => escape(REGION_NAME[cc] || cc);
  const link = (cc) => `<a href="/${product.id}/${cc.toLowerCase()}">${name(cc)}</a>`;
  const lines = [];
  let big;
  if (inStock.length) {
    big = { cls: 'g', text: `${product.parts ? 'At least one part in stock' : 'In stock'} in ${inStock.length} of ${total} countries` };
    const out = listed.filter((cc) => !inStock.includes(cc));
    if (out.length) {
      const dated = out.map((cc) => ({ cc, ts: history?.[`${product.id}:${cc}`]?.lastInStock || '' }))
        .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      const shown = dated.slice(0, OUT_LIST_MAX).map((e) => `${link(e.cc)} (${e.ts ? `last in stock ${dayHtml(e.ts)}` : 'no stock recorded'})`);
      const more = dated.length - shown.length;
      lines.push(`<p><strong>Out of stock:</strong> ${shown.join(', ')}${more ? `, and ${more} more, see the table below` : ''}.</p>`);
    }
  } else if (queued) {
    big = waitlist.length >= reserve.length
      ? { cls: 'a', text: `Waitlist in ${waitlist.length} of ${total} countries` }
      : { cls: 'a', text: `Reservations open in ${reserve.length} of ${total} countries` };
    if (reserve.length && waitlist.length) lines.push(`<p><strong>Reservations open:</strong> ${reserve.map(link).join(', ')}. Everywhere else Steam shows <em>Join waitlist</em>.</p>`);
    const w = commonWindow(product, statusDoc, [...reserve, ...waitlist]);
    if (w) lines.push(`<p>Steam's estimated order window: around ${escape(w)}${product.packages?.length > 1 ? ` for the ${escape(modelName(product, product.packages[0]))}` : ''}.</p>`);
  } else {
    big = { cls: 'r', text: `Out of stock in all ${total} countries` };
    const last = lastInStock(product, history, listed)[0];
    lines.push(last ? `<p>Last in stock anywhere: ${link(last.cc)}, ${dayHtml(last.ts)}.</p>` : '<p>No stock recorded yet.</p>');
  }
  if (STATUS_PAGE_PRODUCTS.includes(product.id)) lines.push(`<p><a href="/${product.id}/status">See the button Steam shows in each country →</a></p>`);
  return `<div class="hero-now"><span class="lbl">Right now</span><div class="big ${big.cls}">${escape(big.text)}</div><div class="bar"><i class="g" style="width:${pct(inStock.length, total)}%"></i><i class="a" style="width:${pct(reserve.length, total)}%"></i><i class="o" style="width:${pct(total - inStock.length - reserve.length, total)}%"></i></div>
    ${lines.join('\n    ')}</div>`;
}

// One panel per country, all hidden. COUNTRY_SCRIPT shows the one for the
// country picked in the alert box, so nothing is guessed at build time.
// The per-country table: countries that list the product, grouped from least
// to most available, with the rest folded into a details block. One line says
// when they were all checked, since every country is checked in the same run.
const GROUP_ORDER = ['out_of_stock', 'waitlist', 'reservation_open', 'in_stock'];

function stockDate(r) {
  const at = r.entry?.lastInStock;
  if (!at) return 'No stock recorded';
  return `${r.status === 'in_stock' ? 'In stock since' : 'Last in stock'} <time datetime="${escape(at)}">${escape(formatDay(at))}</time>`;
}

function countryTableSection(product, rows, statusDoc, prices, checkable) {
  const steam = statusDoc ? listedIn(product, statusDoc) : VALVE_SELLS;
  const listed = rows.filter((r) => steam.includes(r.region.code));
  const others = rows.filter((r) => !steam.includes(r.region.code));
  const key = (r) => (checkable ? r.status || 'none' : 'coming_soon');
  const keys = [...new Set(listed.map(key))]
    .sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99));
  const label = (k) => (k === 'coming_soon' ? 'Coming soon' : statusCopy(k === 'none' ? null : k));
  const body = keys.map((k) => {
    const group = listed.filter((r) => key(r) === k);
    return `<tbody><tr class="grp"><th colspan="4" scope="colgroup">${escape(label(k))} (${group.length})</th></tr>${group.map((r) => {
      const st = checkable ? statusText(product, cell(statusDoc, product, r.region.code), r.status) : 'Coming soon';
      return `<tr data-cc="${r.region.code}"><td class="cn"><a href="/${product.id}/${r.region.code.toLowerCase()}">${escape(r.region.name)}</a></td><td class="st"><span class="badge ${checkable ? r.status || 'unknown' : 'pending'}">${st}</span></td><td class="price">${checkable ? escape(rowPrice(product, prices, r.region.code)) : ''}</td><td class="ls">${stockDate(r)}</td></tr>`;
    }).join('')}</tbody>`;
  }).join('');
  const at = statusDoc?.generatedAt;
  const checked = at
    ? `<p class="checked-line">All ${listed.length} countries were checked together <time class="checked-ago" datetime="${escape(at)}" title="${escape(formatDate(at))}">at ${escape(new Date(at).toUTCString().slice(17, 22))} GMT</time>, every 10 minutes.</p>`
    : '';
  const notSold = others.length
    ? `<details class="notsold"><summary>${others.length} other countries where Steam does not sell the ${escape(product.name)}</summary><p>${others.map((r) => `<a href="/${product.id}/${r.region.code.toLowerCase()}">${escape(r.region.name)}</a>`).join(', ')}</p></details>`
    : '';
  return `<section class="results-section ctable-section" aria-labelledby="ctable-title">
    <h2 id="ctable-title">${escape(product.name)} stock in each Steam country</h2>
    ${checked}
    <div class="history-table-wrap">
    <table class="history-table ctable">
      <thead><tr><th scope="col">Country</th><th scope="col">Status</th><th scope="col">Price</th><th scope="col">Stock history</th></tr></thead>
      ${body}
    </table>
    </div>
    ${notSold}
  </section>`;
}

function yourCountryPanel(product, history, statusDoc, prices, cc) {
  const c = cell(statusDoc, product, cc);
  const st = cellStatus(statusDoc, product, cc);
  const entry = history?.[`${product.id}:${cc}`];
  const price = rowPrice(product, prices, cc);
  const facts = [];
  if (price) facts.push(`${escape(price.charAt(0).toUpperCase() + price.slice(1))} on Steam.`);
  if (st === 'in_stock') {
    if (entry?.lastInStock) facts.push(`In stock since ${dayHtml(entry.lastInStock)}.`);
  } else if (st === 'reservation_open' || st === 'waitlist') {
    const w = orderWindow(c);
    if (w) facts.push(`Order window around ${escape(w)}.`);
    const d = deliveryText(c);
    if (d) facts.push(`Delivery ${escape(d)} once you can order.`);
  } else {
    facts.push(entry?.lastInStock ? `Last in stock ${dayHtml(entry.lastInStock)}.` : 'No stock recorded yet.');
  }
  const alert = st === 'in_stock' ? 'Alert me if it sells out and comes back' : st === 'reservation_open' || st === 'waitlist' ? 'Alert me when reservations open' : 'Alert me when it is back';
  const name = escape(REGION_NAME[cc] || cc);
  return `<div class="yc" data-yc="${cc}" hidden><p class="yc-name">${name}: <span class="badge ${st || 'unknown'}">${statusText(product, c, st)}</span></p>
      <p>${facts.join(' ')}</p>
      <p><a href="/${product.id}/${cc.toLowerCase()}">${name} details</a> · <a href="#alert-title">Change country</a></p>
      <p><a class="yc-alert" href="${escape(trackerUrl(product, cc))}">${alert}</a></p></div>`;
}

function heroSection(product, history, statusDoc, prices) {
  if (!isCheckable(product) || !statusDoc) return '';
  const listed = listedIn(product, statusDoc);
  return `<section class="hero" aria-label="Status summary">
    ${heroNow(product, history, statusDoc, listed)}
    <div class="hero-yc" hidden><span class="lbl">Your country</span>
      ${listed.map((cc) => yourCountryPanel(product, history, statusDoc, prices, cc)).join('\n      ')}
    </div>
  </section>`;
}

function dockStatusSection(product, history, statusDoc) {
  const listed = listedIn(product, statusDoc);
  const inStock = listed.filter((cc) => cellStatus(statusDoc, product, cc) === 'in_stock').length;
  const last = lastInStock(product, history, listed);
  const now = inStock ? `it was in stock in ${inStock} of them at the last check` : 'it was out of stock in all of them at the last check';
  return `<section class="results-section" id="dock-status" aria-labelledby="dock-status-title">
    <h2 id="dock-status-title">Is the ${escape(product.name)} discontinued?</h2>
    <p>Valve has not said so. Steam still lists it in ${listed.length} countries, and ${now}. Valve does not announce restocks in advance.</p>
    <p>${last.length ? `Last in stock: ${last.map((e) => `<a href="/${product.id}/${e.cc.toLowerCase()}">${escape(REGION_NAME[e.cc] || e.cc)}</a> ${dayHtml(e.ts)}`).join(', ')}. ${listed.length > last.length ? `No stock recorded in the other ${listed.length - last.length} countries.` : ''}` : 'No stock has been recorded in any country yet.'}</p>
  </section>`;
}

function dockEuropeSection(product, history, statusDoc, prices) {
  const eu = VALVE_SELLS.filter((cc) => !NOT_EU.includes(cc));
  const inStock = eu.filter((cc) => cellStatus(statusDoc, product, cc) === 'in_stock').length;
  const priced = eu.map((cc) => ({ cc, price: priceRows(product, prices, cc)[0]?.price })).filter((r) => r.price);
  const euro = priced.find((r) => r.price.currency === 'EUR');
  const other = priced.filter((r) => r.price.currency !== 'EUR');
  const price = euro ? ` It costs ${escape(euro.price.formatted)}${other.length ? ` (${other.map((r) => `${escape(r.price.formatted)} in ${escape(REGION_NAME[r.cc] || r.cc)}`).join(', ')})` : ''}.` : '';
  const last = lastInStock(product, history, eu)[0];
  return `<section class="results-section" id="dock-europe" aria-labelledby="dock-europe-title">
    <h2 id="dock-europe-title">${escape(product.name)} in Europe</h2>
    <p>Steam sells the ${escape(product.name)} in ${eu.length} EU countries: ${eu.map((cc) => `<a href="/${product.id}/${cc.toLowerCase()}">${escape(REGION_NAME[cc] || cc)}</a>`).join(', ')}.${price}</p>
    <p>In stock in ${inStock} of ${eu.length} at the last check. ${last ? `Last in stock in the EU: <a href="/${product.id}/${last.cc.toLowerCase()}">${escape(REGION_NAME[last.cc] || last.cc)}</a>, ${dayHtml(last.ts)}.` : 'No EU stock recorded yet.'}</p>
  </section>`;
}

function productTitle(product) {
  return seoFor(product).title;
}

function productDescription(product, statusDoc) {
  const seo = seoFor(product);
  if (seo.description) return seo.description;
  const sold = statusDoc ? VALVE_SELLS.length : null;
  const inStock = VALVE_SELLS.filter((cc) => cellStatus(statusDoc, product, cc) === 'in_stock').length;
  const required = [seo.lead];
  const optional = [];
  if (sold) optional.push(`In stock in ${inStock} of ${sold} Steam countries at the last check.`);
  optional.push('Checked on the Steam Store every 10 minutes.');
  return fitDescription(required, optional, ['Get a free restock alert.']);
}

export function renderProductPage(product, history, statusDoc, { affiliate, prices } = {}) {
  const aff = affiliateParts(product.id, affiliate);
  const canonical = `${SITE}/${product.id}`;
  const checkable = isCheckable(product);

  const rows = REGIONS.map((region) => {
    const entry = history?.[`${product.id}:${region.code}`];
    const status = checkable ? cellStatus(statusDoc, product, region.code) : null;
    return { region, entry, status };
  });
  const inStockCount = rows.filter((r) => r.status === 'in_stock').length;
  const soldIn = REGIONS.filter((r) => soldOnSteam(r.code));

  const title = productTitle(product);
  const description = productDescription(product, statusDoc);

  const countryTable = countryTableSection(product, rows, statusDoc, prices, checkable);

  const modelPrices = (product.packages || []).filter((pkg) => prices?.[pkg.id]?.US);
  const breadcrumbs = breadcrumbsLd([{ name: 'Home', url: `${SITE}/` }, { name: product.name, url: canonical }]);
  const ld = productLd(product, baseOffers(product, statusDoc, prices, VALVE_SELLS));
  const faq = productFaq(product, history, statusDoc, prices);

  return `${shellHead({ title, description, canonical, robots: ROBOTS_INDEX, jsonLd: [ld, breadcrumbs, faqLd(faq)] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/">← All products</a></p>
      <h1>${escape(product.name)} stock and availability by country</h1>
    </div>
  </header>

  ${alertBox(product, statusDoc)}

  <p class="intro">${escape(product.blurb)} ${checkable && statusDoc ? `${product.parts ? 'At least one part in stock' : 'In stock'} in <strong>${inStockCount}</strong> of ${listedIn(product, statusDoc).length} Steam countries at the last check.` : ''}</p>

  ${heroSection(product, history, statusDoc, prices)}

  ${trustStrip(statusDoc)}

  ${product.id === 'steam-dock' ? dockStatusSection(product, history, statusDoc) : ''}

  ${aff.block}

  <section class="results-section" aria-labelledby="countries-title">
    <h2 id="countries-title">Countries where Steam sells the ${escape(product.name)}</h2>
    <p>Steam sells Valve hardware in ${soldIn.length} countries: ${soldIn.map((r) => `<a href="/${product.id}/${r.code.toLowerCase()}">${escape(r.name)}</a>`).join(', ')}.${AVAILABILITY[product.id]?.komodo.length ? ` In ${AVAILABILITY[product.id].komodo.map((cc) => REGION_NAME[cc] || cc).join(', ')} it is sold through Komodo, Valve's official distributor.` : ''} Other countries are listed below for reference.</p>
    ${modelPrices.length ? `<p>US prices on Steam: ${modelPrices.map((pkg) => `${escape(pkg.label || product.name)} ${escape(prices[pkg.id].US.formatted)}`).join(', ')}.</p>` : ''}
    ${ACCESSORY_LINKS[product.id] || ''}
  </section>

  ${product.id === 'steam-dock' ? dockEuropeSection(product, history, statusDoc, prices) : ''}

  ${product.id === 'steam-deck' ? restockSection(product, history, statusDoc) : ''}

  ${product.parts ? partsSection(product, statusDoc, prices) : ''}

  ${explainerSection(product)}

${countryTable}

  ${STATUS_PAGE_PRODUCTS.includes(product.id) ? `<p class="intro"><a href="/${product.id}/status">${escape(product.name)} reservation status by country, with Valve's latest update →</a></p>` : ''}

  <p class="intro" style="margin-top:24px"><a href="${escape(trackerUrl(product))}">Open in live tracker →</a> ${product.steamPath ? `· <a href="${escape(steamUrl(product))}" rel="noreferrer" target="_blank">Steam Store page →</a>` : ''}</p>

  ${relatedSection(product, statusDoc)}

  ${faqHtml(faq, `${product.name} questions`)}

  ${shellFooter(aff.footer)}
</main>
${aff.tracker}
${COUNTRY_SCRIPT}
${ALERT_SCRIPT}
${statusDoc?.generatedAt ? CHECKED_SCRIPT : ''}
${ANALYTICS_BODY}
</body>
</html>`;
}

function regionTitle(product, region, current, text = statusCopy(current)) {
  const short = seoFor(product).short;
  const name = region.name;
  if (soldOnSteam(region.code)) {
    const label = current ? text : 'Stock Tracker';
    return fitTitle([`${short} Stock in ${name}: ${label}`, `${short} in ${name}: ${label}`, `${short} Stock in ${name}`]);
  }
  const note = availabilityFor(product, region.code).note;
  if (note === 'later') return fitTitle([`${short} in ${name}: Coming Later, Says Valve`, `${short} in ${name}: Coming Later`, `${short} in ${name}`]);
  if (note === 'not-sold') return fitTitle([`${short} Not Sold in ${name}, Says Valve`, `${short} Not Sold in ${name}`, `${short} in ${name}`]);
  if (soldViaKomodo(product, region.code)) {
    return fitTitle([`${short} Stock in ${name}: Sold via Komodo`, `${short} in ${name}: Sold via Komodo`, `${short} in ${name}`]);
  }
  return fitTitle([`${short} in ${name}: Not Sold on Steam`, `${short} in ${name}: Not on Steam`, `${short} in ${name}`]);
}

function regionDescription(product, region, current, entry, prices, text = statusCopy(current)) {
  const short = seoFor(product).short;
  const name = region.name;
  if (soldOnSteam(region.code)) {
    const base = priceRows(product, prices, region.code)[0];
    const required = [`${short} in ${name}: ${current ? text.toLowerCase() : 'stock status'} on the Steam Store.`];
    const optional = [];
    if (base) optional.push(`${base.pkg.label ? `The ${base.pkg.label}` : 'It'} costs ${base.price.formatted}.`);
    optional.push(entry?.lastInStock ? `Last in stock ${formatDay(entry.lastInStock)}.` : 'No restock recorded yet.');
    optional.push(['Stock is checked every 10 minutes.', 'Checked every 10 minutes.']);
    return fitDescription(required, optional, ['Get a free restock alert.']);
  }
  const note = availabilityFor(product, region.code).note;
  if (note === 'later') return fitDescription([`Valve says the ${short} will launch in ${name} at a later date. It is not sold there yet.`], [['See where Steam sells it now, with live stock.', 'Where to buy it now.']]);
  if (note === 'not-sold') return fitDescription([`Valve says the ${short} will not be sold in ${name}.`], [[`See the ${VALVE_SELLS.length} countries where Steam sells it, with live stock and free restock alerts.`, 'Where it is sold instead.']]);
  if (soldViaKomodo(product, region.code)) {
    return fitDescription([`${short} in ${name}: sold through Komodo, Valve's official distributor, not the Steam Store.`], ['Komodo stock status and links.', 'Where to buy it there.']);
  }
  return fitDescription([`Steam does not sell the ${short} in ${name}. See the ${VALVE_SELLS.length} countries where Valve sells it on Steam.`], [['Live stock and free restock alerts for each one.', 'Stock for each one.']]);
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

  const text = statusText(product, cell(statusDoc, product, region.code), current);
  const status = !checkable ? 'Coming soon' : (komodo ? 'Sold via Komodo' : text);
  const statusClass = !checkable ? 'pending' : (current || 'unknown');
  const title = regionTitle(product, region, current, text);
  const description = regionDescription(product, region, current, entry, prices, text);
  const robots = isIndexable(product, region.code) ? ROBOTS_INDEX : ROBOTS_NOINDEX;

  // A product sold as parts lists every part, priced or not.
  const priced = !sold ? [] : product.parts ? product.packages.map((pkg) => ({ pkg, price: prices?.[pkg.id]?.[region.code] })) : priceRows(product, prices, region.code);
  const delivery = sold ? deliveryText(cell(statusDoc, product, region.code)) : null;
  const restocks = restockEvents(product, history, [region.code]).slice(0, 5);
  const others = PRODUCTS.filter((p) => p.id !== product.id);

  let body;
  if (sold) {
    body = `
    <p>Steam sells the ${escape(product.name)} in ${escape(region.name)}${current ? `, and at the last check it was <strong>${escape(text.toLowerCase())}</strong>` : ''}.</p>
    ${priced.length ? `<h2>${escape(product.name)} price in ${escape(region.name)}</h2>
    <table class="history-table"><thead><tr><th scope="col">Model</th><th scope="col">Steam price</th><th scope="col">Status</th></tr></thead><tbody>
      ${priced.map(({ pkg, price }) => {
        const pkgStatus = cell(statusDoc, product, region.code)?.packages?.find((p) => p.id === pkg.id)?.status;
        return `<tr><td>${escape(pkg.label || product.name)}</td><td>${escape(price?.formatted || '')}</td><td>${escape(pkgStatus ? statusCopy(pkgStatus) : 'Not checked yet')}</td></tr>`;
      }).join('')}
    </tbody></table>` : ''}
    ${delivery ? `<p>Steam's delivery estimate for ${escape(region.name)}: ${escape(delivery)}.</p>` : ''}
    <h2>Restocks recorded in ${escape(region.name)}</h2>
    ${restocks.length ? `<ul>${restocks.map((e) => `<li><time datetime="${escape(e.ts)}">${escape(formatDay(e.ts))}</time></li>`).join('')}</ul>` : `<p>No restock of the ${escape(product.name)} in ${escape(region.name)} has been recorded yet.</p>`}`;
  } else if (komodo) {
    const avail = availabilityFor(product, region.code);
    const komodoList = AVAILABILITY[product.id].komodo.map((cc) => REGION_NAME[cc] || cc);
    const tracked = Boolean(KOMODO_PRODUCTS[product.id]);
    body = `
    <p>Steam does not sell the ${escape(product.name)} in ${escape(region.name)}. Valve sells it there through Komodo, its official distributor, which also handles ${escape(komodoList.filter((n) => n !== region.name).join(', '))}.</p>
    <p>Orders and prices in ${escape(region.name)} are on Komodo's store, not on Steam, so the Steam stock checks on this site do not cover them.</p>
    <p><a href="${escape(tracked ? `${KOMODO_ORIGIN}${KOMODO_PRODUCTS[product.id]}` : KOMODO_ORIGIN)}" rel="noreferrer" target="_blank">${escape(product.name)} on Komodo →</a> ${tracked ? `The live tracker checks Komodo stock for ${escape(region.name)}.` : `The tracker does not check Komodo stock for the ${escape(product.name)} yet.`}</p>
    <p>Source: <a href="${escape(avail.source)}" rel="noreferrer" target="_blank">Valve's ${escape(product.name)} page</a>.</p>`;
  } else if (availabilityFor(product, region.code).kind === 'note') {
    const avail = availabilityFor(product, region.code);
    const komodoList = AVAILABILITY[product.id].komodo.map((cc) => REGION_NAME[cc] || cc);
    body = avail.note === 'later'
      ? `
    <p>Valve says the ${escape(product.name)} will be available in ${escape(region.name)} at a later date. It has not given one yet. Until then it is not sold in ${escape(region.name)}.</p>
    <p>In the meantime Komodo sells it in ${escape(komodoList.join(', '))}, and Steam sells it in ${VALVE_SELLS.length} countries. See <a href="/${product.id}">${escape(product.name)} stock in every country</a>.</p>
    <p>Source: <a href="${escape(avail.source)}" rel="noreferrer" target="_blank">Valve's ${escape(product.name)} page</a>.</p>`
      : `
    <p>Valve says the ${escape(product.name)} will not be sold in ${escape(region.name)}. Komodo still sells other Valve hardware there, such as the Steam Deck.</p>
    <p>Komodo sells the ${escape(product.name)} in ${escape(komodoList.join(', '))}, and Steam sells it in ${VALVE_SELLS.length} countries. See <a href="/${product.id}">${escape(product.name)} stock in every country</a>.</p>
    <p>Source: <a href="${escape(avail.source)}" rel="noreferrer" target="_blank">Valve's ${escape(product.name)} page</a>.</p>`;
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
  const faq = regionFaq(product, region, history, statusDoc, prices);

  return `${shellHead({ title, description, canonical, robots, jsonLd: [ld, breadcrumbs, faqLd(faq)] })}
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

    ${trustStrip(statusDoc)}

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
    <div class="pcards">${others.map((p) => {
      const s = isCheckable(p) ? cellStatus(statusDoc, p, region.code) : null;
      const komodo = soldViaKomodo(p, region.code);
      const text = komodo ? 'Sold via Komodo' : statusText(p, cell(statusDoc, p, region.code), s);
      const cls = !komodo && s && VALVE_SELLS.includes(region.code) ? s : 'unknown';
      return pcard({ href: `/${p.id}/${region.code.toLowerCase()}`, icon: p.icon, name: p.name, badge: { cls, text } });
    }).join('')}</div>
  </section>

  ${faqHtml(faq, `${product.name} in ${region.name}: questions`)}

  ${shellFooter(aff.footer)}
</main>
${aff.tracker}
${statusDoc?.generatedAt ? CHECKED_SCRIPT : ''}
${ANALYTICS_BODY}
</body>
</html>`;
}
