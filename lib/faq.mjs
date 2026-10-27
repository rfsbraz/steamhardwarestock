// FAQ blocks for product and country pages, with FAQPage JSON-LD. Every
// answer is built from that page's own data (status, prices, history), so
// country pages do not repeat each other.
import { PRODUCTS, REGIONS, VALVE_SELLS, isCheckable } from './products.mjs';
import { soldOnSteam, soldViaKomodo, KOMODO_REGIONS, KOMODO_PRODUCTS } from './seo.mjs';
import { currencyFor } from './prices.mjs';
import { statusText } from './parts.mjs';

const CURRENCY_NAME = { USD: 'US dollars', CAD: 'Canadian dollars', GBP: 'pounds sterling', AUD: 'Australian dollars', PLN: 'Polish złoty', EUR: 'euros' };
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.code, r.name]));
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const cellOf = (doc, product, cc) => doc?.products?.[product.id]?.[cc] || null;
const priced = (product, prices, cc) => (product.packages || []).map((pkg) => ({ pkg, price: prices?.[pkg.id]?.[cc] })).filter((r) => r.price);
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function buyAnswer(product, region, doc) {
  const c = region.name;
  const cell = cellOf(doc, product, region.code);
  const when = doc?.generatedAt ? ` on ${day(doc.generatedAt)}` : '';
  if (!cell) return `Steam sells the ${product.name} in ${c}. The tracker has no result for ${c} from the last check yet.`;
  switch (cell.status) {
    case 'in_stock': return product.parts
      ? `Some of it. At the last check${when}, Steam in ${c} had ${statusText(product, cell).toLowerCase()}. The table above lists each part.`
      : `Yes. Steam sells the ${product.name} in ${c}, and it was in stock at the last check${when}.`;
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
          ? `At the last check in ${c}: ${others.map((x) => `${x.o.name}: ${statusText(x.o, x.cell)}`).join(', ')}.`
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

// Questions only one product's buyers ask. Valve's wording is quoted from its
// Steam pages (26 Oct 2026). The purchase rule is reported by buyers, not by
// Valve, so it stays marked as unconfirmed.
const PRODUCT_QUESTIONS = {
  'valve-index': [
    { q: 'Is the Valve Index discontinued?', a: 'Yes. Valve\'s Steam page says "Valve Index is no longer being produced. Remaining Index headsets, controllers, and accessories are still available at the new prices below while supplies last." Valve cut every Index price by 20% on 13 Oct 2026.' },
    { q: 'Will Valve restock the Valve Index?', a: 'Valve has not said it will make more. Steam sells what is left, so a part that sells out in a country may not come back. This page shows the parts Steam still has in each country.' }
  ],
  'steam-frame-replacement-kit': [
    { q: 'What is in the Steam Frame Accessory Replacement Kit?', a: 'One face gasket, one head cushion and one standard light blocker, the soft parts that come in the Steam Frame box.' },
    { q: 'Why does Steam say "Login for purchase"?', a: 'Steam limits which accounts can buy the kit. Its store data carries an account purchase date requirement of 27 Apr 2026, which may mean only Steam Frame owners can buy it. Valve has not documented this, so it is unverified. This tracker checks without an account and shows the kit as out of stock wherever Steam limits the purchase.' }
  ],
  'steam-hardware-power-supply': [
    { q: 'Does the Steam Frame come with a power supply?', a: 'No. Valve\'s Steam Frame page says "Power Supply not included". The Steam Hardware Power Supply Unit is sold on its own.' },
    { q: 'What is the Steam Hardware Power Supply Unit?', a: 'Valve\'s 45W USB-C power supply (PD3.0) with a 2.5m cable. It is also the Steam Deck charger option on Steam.' },
    { q: 'Do I have to order a Steam Frame first?', a: 'Not confirmed. Reddit users and Steam support, as reported on r/SteamFrame (23 to 27 Sept), say you can buy Frame accessories after you order a Frame, once they are back in stock. Valve has not documented this, so it is unverified.' }
  ]
};

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
        ? `At the last check on ${day(doc.generatedAt)}, ${product.parts ? `at least one ${p} part` : `the ${p}`} was in stock in ${n('in_stock')} of ${VALVE_SELLS.length} countries${n('reservation_open') ? `, open for reservations in ${n('reservation_open')}` : ''}${n('waitlist') ? `, and on a waitlist in ${n('waitlist')}` : ''}.`
        : `The ${p} has not been checked yet. The table above shows each country once it has.`
    });
    const us = priced(product, prices, 'US');
    out.push({
      q: `How much does the ${p} cost?`,
      a: us.length ? `In the United States, Steam lists ${list(us.map(({ pkg, price }) => `${pkg.label || p} at ${price.formatted}`))}. Each country page has the local price.` : `Prices differ by country. Each country page shows the local Steam price when Steam lists one.`
    });
  }
  out.push({ q: `How often is ${p} stock checked?`, a: `Every 10 minutes, straight from the Steam store, for each of the ${VALVE_SELLS.length} countries. Changes are kept in the stock history.` });
  return [...out, ...(PRODUCT_QUESTIONS[product.id] || [])];
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
