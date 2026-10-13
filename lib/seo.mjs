import { availabilityFor } from './availability.mjs';
import { VALVE_SELLS } from './products.mjs';

// Search copy per product. The wording follows Search Console queries
// (see docs/seo.md): Frame and Machine searches ask about availability and
// countries, Deck and Dock searches ask about restocks and stock, the
// Controller and the homepage get "tracker" searches.
export const PRODUCT_SEO = {
  'steam-controller': {
    short: 'Steam Controller',
    title: 'Steam Controller Stock Tracker: Available Regions',
    lead: 'Steam Controller stock tracker for every region Steam sells it in.'
  },
  'steam-deck': {
    short: 'Steam Deck',
    title: 'Steam Deck Restock Tracker: Stock by Country',
    lead: 'Steam Deck restock tracker with live OLED and LCD stock by country.'
  },
  'steam-dock': {
    short: 'Steam Deck Dock',
    title: 'Steam Deck Dock Restock: Out of Stock Tracker',
    lead: 'Is the Steam Deck Dock out of stock? Live restock status by country.'
  },
  'steam-deck-refurbished': {
    short: 'Refurbished Steam Deck',
    title: 'Refurbished Steam Deck Restock Tracker by Country',
    lead: 'Valve Certified Refurbished Steam Deck restocks, tracked by country.'
  },
  'steam-frame': {
    short: 'Steam Frame',
    title: 'Steam Frame Availability: Countries and Stock',
    lead: 'Steam Frame availability: the countries Steam sells it in and stock.'
  },
  'steam-machine': {
    short: 'Steam Machine',
    title: 'Steam Machine Availability by Country: Stock Tracker',
    lead: 'Steam Machine availability by country, with live stock from Steam.'
  }
};

// Komodo is Valve's official distributor in these regions, for these products.
export const KOMODO_REGIONS = ['JP', 'KR', 'HK', 'TW'];
export const KOMODO_PRODUCTS = {
  'steam-deck': '/product/steam-deck_jpy/',
  'steam-controller': '/product/steam-controller/'
};

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

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

// Joins sentences, dropping optional ones from the end until it fits.
export function fitDescription(required, optional = []) {
  const parts = [...required, ...optional];
  while (parts.length > required.length && parts.join(' ').length > DESCRIPTION_MAX) parts.pop();
  return parts.join(' ');
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
