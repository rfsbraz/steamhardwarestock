// FAQ blocks for product and country pages, with FAQPage JSON-LD. Every
// answer is built from that page's own data (status, prices, history), so
// country pages do not repeat each other.
import StockStatus from '../public/stock-status.js';
import { PRODUCTS, REGIONS, VALVE_SELLS, isCheckable } from './products.mjs';
import { soldOnSteam, soldViaKomodo, KOMODO_REGIONS, KOMODO_PRODUCTS } from './seo.mjs';
import { currencyFor } from './prices.mjs';

const CURRENCY_NAME = { USD: 'US dollars', CAD: 'Canadian dollars', GBP: 'pounds sterling', AUD: 'Australian dollars', PLN: 'Polish złoty', EUR: 'euros' };
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.code, r.name]));
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const label = (s) => StockStatus.copyFor(s).label;
const cellOf = (doc, product, cc) => doc?.products?.[product.id]?.[cc] || null;
const priced = (product, prices, cc) => (product.packages || []).map((pkg) => ({ pkg, price: prices?.[pkg.id]?.[cc] })).filter((r) => r.price);
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function buyAnswer(product, region, doc) {
  const c = region.name;
  const cell = cellOf(doc, product, region.code);
  const when = doc?.generatedAt ? ` on ${day(doc.generatedAt)}` : '';
  if (!cell) return `Steam sells the ${product.name} in ${c}. The tracker has no result for ${c} from the last check yet.`;
  switch (cell.status) {
    case 'in_stock': return `Yes. Steam sells the ${product.name} in ${c}, and it was in stock at the last check${when}.`;
    case 'reservation_open': return `Steam sells the ${product.name} in ${c} through reservations, and reservations were open at the last check${when}. Steam emails you when your order can be placed.`;
    case 'waitlist': return `Steam sells the ${product.name} in ${c}, but at the last check${when} it only offered a waitlist for ${c}.`;
    default: return `Steam sells the ${product.name} in ${c}, but it was out of stock there at the last check${when}.`;
  }
}

export function regionFaq(product, region, history, doc, prices) {
  const c = region.name;
  const p = product.name;
  if (!isCheckable(product)) {
    return [{ q: `Can I buy the ${p} in ${c}?`, a: `Not yet. Steam has not opened sales of the ${p}. When it does, this page shows its status in ${c}.` }];
  }
  if (soldOnSteam(region.code)) {
    const rows = priced(product, prices, region.code);
    const currency = currencyFor(region.code);
    const entry = history?.[`${product.id}:${region.code}`];
    const others = PRODUCTS.filter((o) => o.id !== product.id && isCheckable(o))
      .map((o) => ({ o, cell: cellOf(doc, o, region.code) }))
      .filter((x) => x.cell);
    return [
      { q: `Can I buy the ${p} in ${c}?`, a: buyAnswer(product, region, doc) },
      {
        q: `How much does the ${p} cost in ${c}?`,
        a: rows.length
          ? `On Steam in ${c}: ${list(rows.map(({ pkg, price }) => `${pkg.label || p} ${price.formatted}`))}.`
          : `Steam did not list a price for the ${p} in ${c} at the last build. Steam charges in ${CURRENCY_NAME[currency] || currency} in ${c}.`
      },
      {
        q: `When was the ${p} last in stock in ${c}?`,
        a: entry?.lastInStock ? `The ${p} was last in stock in ${c} on ${day(entry.lastInStock)}.` : `No restock of the ${p} in ${c} has been recorded yet.`
      },
      {
        q: `What other Valve hardware does Steam sell in ${c}?`,
        a: others.length
          ? `At the last check in ${c}: ${others.map((x) => `${x.o.name}: ${label(x.cell.status)}`).join(', ')}.`
          : `Steam sells Valve hardware in ${c}. The other products have no result for ${c} from the last check yet.`
      }
    ];
  }
  if (soldViaKomodo(product, region.code)) {
    return [
      { q: `Can I buy the ${p} in ${c}?`, a: `Yes, but not on Steam. Valve sells the ${p} in ${c} through Komodo, its official distributor.` },
      { q: `Does the tracker show Komodo stock for ${c}?`, a: `The live tracker checks Komodo stock for ${c}. This page links to the Komodo product page.` }
    ];
  }
  return [
    { q: `Can I buy the ${p} in ${c}?`, a: `Not from Valve. Steam does not sell the ${p} in ${c}, and Valve has no official distributor there.` },
    { q: `Where does Steam sell the ${p}?`, a: `Steam sells it in ${VALVE_SELLS.length} countries, and ${c} is not one of them. The ${p} page lists every country with its stock.` }
  ];
}

export function productFaq(product, history, doc, prices) {
  const p = product.name;
  const names = VALVE_SELLS.map((cc) => REGION_NAME[cc] || cc);
  const komodo = KOMODO_PRODUCTS[product.id] ? ` Valve also sells it in ${list(KOMODO_REGIONS.map((cc) => REGION_NAME[cc] || cc))} through Komodo.` : '';
  const out = [{ q: `Which countries sell the ${p} on Steam?`, a: `Steam sells Valve hardware in ${VALVE_SELLS.length} countries: ${list(names)}.${komodo}` }];
  if (isCheckable(product)) {
    const cells = VALVE_SELLS.map((cc) => cellOf(doc, product, cc)).filter(Boolean);
    const n = (s) => cells.filter((x) => x.status === s).length;
    out.push({
      q: `Is the ${p} in stock right now?`,
      a: doc?.generatedAt
        ? `At the last check on ${day(doc.generatedAt)}, the ${p} was in stock in ${n('in_stock')} of ${VALVE_SELLS.length} countries${n('reservation_open') ? `, open for reservations in ${n('reservation_open')}` : ''}${n('waitlist') ? `, and on a waitlist in ${n('waitlist')}` : ''}.`
        : `The ${p} has not been checked yet. The table above shows each country once it has.`
    });
    const us = priced(product, prices, 'US');
    out.push({
      q: `How much does the ${p} cost?`,
      a: us.length ? `In the United States, Steam lists ${list(us.map(({ pkg, price }) => `${pkg.label || p} at ${price.formatted}`))}. Each country page has the local price.` : `Prices differ by country. Each country page shows the local Steam price when Steam lists one.`
    });
  }
  out.push({ q: `How often is ${p} stock checked?`, a: `Every 10 minutes, straight from the Steam store, for each of the ${VALVE_SELLS.length} countries. Changes are kept in the stock history.` });
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function faqHtml(items, heading) {
  if (!items.length) return '';
  return `<section class="results-section faq" aria-labelledby="faq-title">
    <h2 id="faq-title">${esc(heading)}</h2>
    ${items.map(({ q, a }) => `<h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join('\n    ')}
  </section>`;
}

export function faqLd(items) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  };
}
