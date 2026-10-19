// /steam-deck-black-friday: Steam Deck stock, prices and discounts for Black
// Friday and the Steam Winter Sale. Built from the same status, history and
// price data as the product pages, with the same layout.
import { PRODUCTS, REGIONS, VALVE_SELLS } from './products.mjs';
import { SITE } from './site.mjs';
import { latestEvent, formatDay, fitDescription } from './seo.mjs';
import { faqHtml, faqLd } from './faq.mjs';
import { ANALYTICS_BODY } from './analytics.mjs';
import {
  escape, shellHead, shellFooter, breadcrumbsLd, ROBOTS_INDEX, affiliateParts, lastCheckHtml, statusCopy
} from './landing.mjs';

export const DECK_SALE_PATH = '/steam-deck-black-friday';
// The homepage links here until the Steam Winter Sale ends. The page itself
// stays up and in the sitemap after that.
export const SEASON_END = '2027-01-05T00:00:00.000Z';
const BLACK_FRIDAY = '27 November 2026';
const WINTER_SALE = '17 December 2026 to 4 January 2027';
const STEAM_SALES_SOURCE = 'https://partner.steamgames.com/doc/marketing/discounts/seasonalsales';

const DECK = PRODUCTS.find((p) => p.id === 'steam-deck');
const REFURB = PRODUCTS.find((p) => p.id === 'steam-deck-refurbished');
const DOCK = PRODUCTS.find((p) => p.id === 'steam-dock');
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.code, r.name]));
const KEYS = [DECK, REFURB].flatMap((p) => REGIONS.map((r) => `${p.id}:${r.code}`));

export function seasonLink(now = new Date()) {
  return now.getTime() < Date.parse(SEASON_END)
    ? `<li><a href="${DECK_SALE_PATH}">Steam Deck Black Friday stock</a></li>`
    : '';
}

export function deckSaleLastmod(history) {
  return latestEvent(history, KEYS);
}

const cellOf = (doc, product, cc) => doc?.products?.[product.id]?.[cc] || null;
const pkgStatus = (doc, product, pkg, cc) => cellOf(doc, product, cc)?.packages?.find((p) => p.id === pkg.id)?.status || null;
const modelName = (product, pkg) => `${product === REFURB ? 'Refurbished ' : ''}${pkg.label}`;
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function badge(status) {
  return `<span class="badge ${status || 'unknown'}">${escape(statusCopy(status))}</span>`;
}

function changed(history, product, cc) {
  const ts = latestEvent(history, [`${product.id}:${cc}`]);
  return ts ? `<time datetime="${escape(ts)}">${escape(formatDay(ts))}</time>` : 'None recorded';
}

// Every model and country where Steam showed a discount at the last build.
function discounts(prices) {
  const out = [];
  for (const product of [DECK, REFURB]) {
    for (const pkg of product.packages) {
      for (const cc of VALVE_SELLS) {
        const price = prices?.[pkg.id]?.[cc];
        if (price?.discountPct) out.push({ product, pkg, cc, price });
      }
    }
  }
  return out;
}

function saleSection(prices) {
  const found = discounts(prices);
  const body = found.length
    ? `<ul>${found.map(({ product, pkg, cc, price }) => `<li><a href="/${product.id}/${cc.toLowerCase()}">${escape(modelName(product, pkg))} in ${escape(REGION_NAME[cc] || cc)}</a>: ${escape(price.formatted)}, ${price.discountPct}% off ${escape(price.formattedOriginal)}</li>`).join('')}</ul>`
    : '<p>Steam showed no discount on any new or refurbished Steam Deck model when this page was last built.</p>';
  return `<section class="results-section" id="on-sale" aria-labelledby="on-sale-title">
    <h2 id="on-sale-title">Steam Deck models on sale</h2>
    ${body}
    <p>Prices come from the Steam store when the page is built. Steam lists its Winter Sale for ${WINTER_SALE} (<a href="${STEAM_SALES_SOURCE}" rel="noreferrer" target="_blank">Steam's sale calendar</a>). Valve has not published Steam Deck prices for Black Friday or the Winter Sale.</p>
  </section>`;
}

function newTable(history, doc) {
  const head = DECK.packages.map((pkg) => `<th scope="col">${escape(pkg.label)}</th>`).join('');
  const rows = VALVE_SELLS.map((cc) => `<tr data-cc="${cc}">
      <td><a href="/${DECK.id}/${cc.toLowerCase()}">${escape(REGION_NAME[cc] || cc)}</a></td>
      ${DECK.packages.map((pkg) => `<td>${badge(pkgStatus(doc, DECK, pkg, cc))}</td>`).join('')}
      <td>${changed(history, DECK, cc)}</td>
    </tr>`).join('');
  return `<section class="results-section" aria-labelledby="new-title">
    <h2 id="new-title">New Steam Deck stock by country</h2>
    <div class="history-table-wrap">
    <table class="history-table">
      <thead><tr><th scope="col">Country</th>${head}<th scope="col">Last change</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </section>`;
}

function refurbTable(history, doc) {
  const rows = VALVE_SELLS.map((cc) => {
    const inStock = REFURB.packages.filter((pkg) => pkgStatus(doc, REFURB, pkg, cc) === 'in_stock').map((pkg) => pkg.label);
    return `<tr data-refurb-cc="${cc}">
      <td><a href="/${REFURB.id}/${cc.toLowerCase()}">${escape(REGION_NAME[cc] || cc)}</a></td>
      <td>${badge(cellOf(doc, REFURB, cc)?.status || null)}</td>
      <td>${escape(inStock.join(', ') || 'None')}</td>
      <td>${changed(history, REFURB, cc)}</td>
    </tr>`;
  }).join('');
  return `<section class="results-section" aria-labelledby="refurb-title">
    <h2 id="refurb-title">Refurbished Steam Deck stock by country</h2>
    <div class="history-table-wrap">
    <table class="history-table">
      <thead><tr><th scope="col">Country</th><th scope="col">Status</th><th scope="col">Models in stock</th><th scope="col">Last change</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
  </section>`;
}

function countIn(doc, product, status) {
  return VALVE_SELLS.filter((cc) => cellOf(doc, product, cc)?.status === status).length;
}

function lowestUs(product, prices) {
  const us = product.packages.map((pkg) => prices?.[pkg.id]?.US).filter(Boolean).sort((a, b) => a.amount - b.amount);
  return us[0]?.formatted || null;
}

export function saleFaq(history, doc, prices, affiliate) {
  const n = VALVE_SELLS.length;
  const newFrom = lowestUs(DECK, prices);
  const refurbFrom = lowestUs(REFURB, prices);
  const dock = doc ? cellOf(doc, DOCK, 'US')?.status : null;
  const jsaux = Boolean(affiliate?.jsaux?.refId);
  return [
    {
      q: 'When do Steam Deck sales usually start?',
      a: `Valve does not announce Steam Deck discounts far in advance. In past years it has discounted some models during Steam's seasonal sales. Steam lists its Winter Sale for ${WINTER_SALE}, and Black Friday is on ${BLACK_FRIDAY}. This page lists a discount as soon as Steam shows one.`
    },
    {
      q: 'Is the Steam Deck in stock right now?',
      a: doc?.generatedAt
        ? `At the last check on ${formatDay(doc.generatedAt)}, the new Steam Deck was in stock in ${countIn(doc, DECK, 'in_stock')} of ${n} Steam countries, and the refurbished Steam Deck in ${countIn(doc, REFURB, 'in_stock')}.`
        : 'The Steam Deck has not been checked yet. The tables above show each country once it has.'
    },
    {
      q: 'Should I buy a refurbished or a new Steam Deck?',
      a: `Valve Certified Refurbished Steam Decks are units Valve has tested and resells itself, for less than new.${refurbFrom ? ` In the US they start at ${refurbFrom}` : ''}${refurbFrom && newFrom ? `, against ${newFrom} for a new one.` : refurbFrom ? '.' : ''} Valve restocks them in small batches, so they sell out more often. New units are the 512GB and 1TB OLED, plus the 256GB LCD in some countries.`
    },
    {
      q: 'What about Steam Deck accessories?',
      a: `The official Steam Deck Docking Station has its own stock page${dock ? `, and it was ${statusCopy(dock).toLowerCase()} in the US at the last check` : ''}.${jsaux ? ' The accessory links near the top of this page go to JSAUX. They are affiliate links.' : ''}`
    },
    {
      q: 'How often is this page updated?',
      a: `Stock is checked on the Steam store every 10 minutes in each of the ${n} countries, and the page is rebuilt when a status changes. Prices and discounts come from Steam at each rebuild.`
    }
  ];
}

export function renderDeckSalePage(history, statusDoc, { affiliate, prices } = {}) {
  const aff = affiliateParts(DECK.id, affiliate);
  const canonical = `${SITE}${DECK_SALE_PATH}`;
  const title = 'Steam Deck Black Friday 2026: Stock and Sale Tracker';
  const description = fitDescription(
    ['Steam Deck stock and prices for Black Friday and the Steam Winter Sale, by model and country.'],
    ['New and refurbished, checked every 10 minutes.']
  );
  const crumbs = breadcrumbsLd([{ name: 'Home', url: `${SITE}/` }, { name: 'Steam Deck Black Friday stock', url: canonical }]);
  const faq = saleFaq(history, statusDoc, prices, affiliate);

  return `${shellHead({ title, description, canonical, robots: ROBOTS_INDEX, jsonLd: [crumbs, faqLd(faq)] })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/">← All products</a></p>
      <h1>Steam Deck stock for Black Friday and the holidays</h1>
    </div>
  </header>

  <p class="intro">Steam Deck stock and prices on the Steam store in the ${VALVE_SELLS.length} countries where Valve sells it, for Black Friday on ${BLACK_FRIDAY} and the Steam Winter Sale. The full country pages are on <a href="/${DECK.id}">Steam Deck stock by country</a> and <a href="/${REFURB.id}">refurbished Steam Deck stock by country</a>.</p>

  ${lastCheckHtml(statusDoc)}

  ${aff.block}

  ${saleSection(prices)}

  ${newTable(history, statusDoc)}

  ${refurbTable(history, statusDoc)}

  <p class="intro" style="margin-top:24px"><a href="/?p=${DECK.id}">Get a Steam Deck stock alert in the live tracker →</a> · <a href="/history">Stock history →</a></p>

  ${faqHtml(faq, 'Steam Deck Black Friday questions')}

  ${shellFooter(aff.footer)}
</main>
${aff.tracker}
${ANALYTICS_BODY}
</body>
</html>`;
}
