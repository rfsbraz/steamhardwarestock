import { availabilityFor } from './availability.mjs';
import { VALVE_SELLS } from './products.mjs';

// Search copy per product. The wording follows Search Console queries
// (see docs/seo.md): Frame and Machine searches ask about availability and
// countries, Deck and Dock searches ask about restocks and stock, the
// Controller and the homepage get "tracker" searches.
// A fixed `description` is used as is. Pages with only a `lead` get the live
// in-stock count added. The fixed ones are the round 1 CTR test copy, which
// must not change between builds while the test runs.
export const PRODUCT_SEO = {
  'steam-controller': {
    short: 'Steam Controller',
    title: 'Steam Controller Tracker: Stock and Reservations by Region',
    description: 'Steam Controller tracker: reservation, waitlist and stock status in every region Steam sells it, with the last in-stock date per country. Free alert.'
  },
  'steam-deck': {
    short: 'Steam Deck',
    title: 'Steam Deck Stock Tracker: Available Countries and Restocks',
    description: 'Where can you buy a Steam Deck right now? Live OLED and LCD stock in the 31 countries Steam sells it, every recorded restock, and a free restock alert.'
  },
  'steam-dock': {
    short: 'Steam Deck Dock',
    title: 'Steam Deck Dock Out of Stock? Restock Tracker by Country',
    description: 'Is the Steam Deck Docking Station out of stock? Live stock in 31 Steam countries, the date it was last in stock in each, and a free alert when it restocks.'
  },
  'steam-deck-refurbished': {
    short: 'Refurbished Steam Deck',
    title: 'Refurbished Steam Deck Restock Tracker by Country',
    lead: 'Valve Certified Refurbished Steam Deck restocks, tracked by country.'
  },
  'steam-frame': {
    short: 'Steam Frame',
    title: 'Steam Frame Availability by Country: Stock and Waitlist',
    description: 'Is the Steam Frame in stock? See where Steam sells it, plus the waitlist or reservation status and price in each of 31 countries. Free restock alert.'
  },
  'steam-frame-ergonomic-kit': {
    short: 'Frame Ergonomic Kit',
    title: 'Steam Frame Ergonomic Kit Restock by Country',
    // Country page titles, longest first; the first that fits is used. The
    // stock status lives in the description so the title keeps the words
    // people search with.
    countryTitles: [
      'Steam Frame Ergonomic Accessories Kit stock in {country}',
      'Steam Frame Ergonomic Accessories Kit in {country}',
      'Steam Frame Ergonomic Kit stock in {country}'
    ],
    lead: 'Steam Frame Ergonomic Accessories Kit restock status by country.'
  },
  'steam-frame-replacement-kit': {
    short: 'Frame Replacement Kit',
    title: 'Steam Frame Replacement Kit Restock by Country',
    description: 'Is the Steam Frame Replacement Kit in stock? Spare face gasket, head cushion and light blocker. Live stock in 31 Steam countries and a free restock alert.'
  },
  'steam-hardware-power-supply': {
    short: 'Steam Power Supply',
    title: 'Steam Hardware Power Supply Restock by Country',
    description: 'Is the Steam Hardware Power Supply in stock? The Steam Frame ships without one. Live stock and prices in 31 Steam countries, plus a free restock alert.'
  },
  'valve-index': {
    short: 'Valve Index',
    title: 'Valve Index Stock: Discontinued, Remaining Parts by Country',
    description: 'The Valve Index is discontinued. See which headsets, controllers, base stations and parts Steam still has in each of 31 countries, while supplies last.'
  },
  'steam-machine': {
    short: 'Steam Machine',
    title: 'Steam Machine Stock Tracker: Available Countries',
    description: 'Is the Steam Machine in stock? Track the waitlist and reservation status in all 31 countries Steam sells it, with local prices. Free restock alert.'
  }
};

// Komodo is Valve's official distributor in these regions, for these products.
export const KOMODO_REGIONS = ['JP', 'KR', 'HK', 'TW'];
export const KOMODO_PRODUCTS = {
  'steam-deck': '/product/steam-deck_jpy/',
  'steam-controller': '/product/steam-controller/'
};

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 155;

export function seoFor(product) {
  return PRODUCT_SEO[product.id] || { short: product.name, title: `${product.name} Stock Tracker`, lead: `${product.name} stock by country.` };
}

export function soldOnSteam(regionCode) {
  return VALVE_SELLS.includes(regionCode);
}

export function soldViaKomodo(product, regionCode) {
  return availabilityFor(product, regionCode).kind === 'komodo';
}

// A country page is indexed where the product can be bought, or where Valve
// has said something specific about that country (see lib/availability.mjs).
// The rest read the same apart from the name, so they stay noindex and out
// of the sitemap.
export function isIndexable(product, regionCode) {
  return soldOnSteam(regionCode) || availabilityFor(product, regionCode).kind !== 'none';
}

export function fitTitle(candidates) {
  return candidates.find((t) => t.length <= TITLE_MAX) || candidates[candidates.length - 1].slice(0, TITLE_MAX);
}

// Joins the required sentences, then each optional one that still fits, in
// order, then the closing ones. An optional entry can be a list of
// alternatives, longest first; the first that fits is used.
export function fitDescription(required, optional = [], closing = []) {
  const parts = [...required];
  const fits = (s) => [...parts, s, ...closing].join(' ').length <= DESCRIPTION_MAX;
  for (const entry of optional) {
    const pick = [entry].flat().find(fits);
    if (pick) parts.push(pick);
  }
  return [...parts, ...closing].join(' ');
}

export function formatDay(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Latest recorded event time for some history keys, or null.
export function latestEvent(history, keys) {
  let latest = null;
  for (const key of keys) {
    for (const e of history?.[key]?.events || []) {
      if (e?.ts && (!latest || e.ts > latest)) latest = e.ts;
    }
  }
  return latest;
}
