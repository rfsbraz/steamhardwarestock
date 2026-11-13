// Atom and RSS feeds of stock changes, built from the KV stock history.
// Served by functions/feed.xml.js and functions/rss.xml.js for everything, and
// by functions/[scope]/ for one product, one country or both. Read only.
import StockStatus from '../public/stock-status.js';
import { SITE } from './site.mjs';
import { productById, regionByCode, VALVE_SELLS } from './products.mjs';

export const FEED_LIMIT = 50;
export const FEED_TITLE = 'Steam hardware stock changes';
export const FEED_CACHE = 'public, max-age=300, s-maxage=600, stale-while-revalidate=600';
const EPOCH = '1970-01-01T00:00:00.000Z';

const xml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const ALL = {
  path: '',
  title: FEED_TITLE,
  link: `${SITE}/history`,
  subtitle: 'Official Steam store stock changes for Steam Deck, Frame, Machine, Controller and Dock, by country.',
  description: 'Official Steam store stock changes, by country.'
};

// The feed for a path's segments: [] is every change, [product],
// [country] or [product, country] narrow it. Countries are lowercase codes
// the tracker checks. Anything else is null, which the Functions send to 404.
const trackedCountry = (s) => (typeof s === 'string' && s === s.toLowerCase() && VALVE_SELLS.includes(s.toUpperCase()) ? regionByCode(s) : null);

export function feedScope([first, second, ...rest] = []) {
  if (first === undefined) return ALL;
  if (rest.length) return null;
  const product = productById(first);
  const region = trackedCountry(product ? second : first);
  if (product ? second !== undefined && !region : !region || second !== undefined) return null;
  const path = `${product ? `/${product.id}` : ''}${region ? `/${region.code.toLowerCase()}` : ''}`;
  const where = region ? ` in ${region.name}` : '';
  const title = `${product ? product.name : 'Steam hardware'} stock changes${where}`;
  const description = `Official Steam store stock changes for ${product ? `the ${product.name}${where || ', by country'}` : `Valve hardware${where}`}.`;
  return { product, region, path, title, link: product ? `${SITE}${path}` : `${SITE}/history`, subtitle: description, description };
}

export function feedEvents(history, limit = FEED_LIMIT, scope = ALL) {
  const out = [];
  for (const [key, entry] of Object.entries(history || {})) {
    if (!entry || !Array.isArray(entry.events)) continue;
    if (scope.product && entry.productId !== scope.product.id) continue;
    if (scope.region && String(entry.region || '').toUpperCase() !== scope.region.code) continue;
    const product = productById(entry.productId);
    const region = regionByCode(entry.region);
    for (const e of entry.events) {
      if (!e || Number.isNaN(Date.parse(e.ts))) continue;
      const status = e.status || (e.available ? 'in_stock' : 'out_of_stock');
      const productName = entry.productName || product?.name || entry.productId;
      const regionName = region?.name || entry.region;
      out.push({
        ts: new Date(e.ts).toISOString(),
        id: `tag:steamhardwarestock.com,2026:${key}:${new Date(e.ts).toISOString()}`,
        title: `${productName} in ${regionName}: ${StockStatus.copyFor(status).label}`,
        summary: StockStatus.copyFor(status).reason,
        link: product && region ? `${SITE}/${product.id}/${region.code.toLowerCase()}` : `${SITE}/history`
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
}

export function buildAtom(history, scope = ALL) {
  const events = feedEvents(history, FEED_LIMIT, scope);
  const self = `${SITE}${scope.path}/feed.xml`;
  const entries = events.map((e) => `  <entry>
    <id>${xml(e.id)}</id>
    <title>${xml(e.title)}</title>
    <updated>${e.ts}</updated>
    <link rel="alternate" type="text/html" href="${xml(e.link)}"/>
    <summary>${xml(e.summary)}</summary>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${xml(self)}</id>
  <title>${xml(scope.title)}</title>
  <subtitle>${xml(scope.subtitle)}</subtitle>
  <updated>${events[0]?.ts || EPOCH}</updated>
  <link rel="self" type="application/atom+xml" href="${xml(self)}"/>
  <link rel="alternate" type="text/html" href="${xml(scope.link)}"/>
  <author><name>Steam Hardware Stock Tracker</name></author>
${entries}
</feed>
`;
}

export function buildRss(history, scope = ALL) {
  const events = feedEvents(history, FEED_LIMIT, scope);
  const items = events.map((e) => `    <item>
      <title>${xml(e.title)}</title>
      <link>${xml(e.link)}</link>
      <guid isPermaLink="false">${xml(e.id)}</guid>
      <pubDate>${new Date(e.ts).toUTCString()}</pubDate>
      <description>${xml(e.summary)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(scope.title)}</title>
    <link>${xml(scope.link)}</link>
    <description>${xml(scope.description)}</description>
    <atom:link rel="self" type="application/rss+xml" href="${xml(`${SITE}${scope.path}/rss.xml`)}"/>
    <lastBuildDate>${new Date(events[0]?.ts || EPOCH).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

// Discovery links for a scoped feed, RSS first. The global feed keeps FEED_LINKS.
export function feedLinks(scope) {
  return `<link rel="alternate" type="application/rss+xml" title="${xml(scope.title)} (RSS)" href="${xml(`${SITE}${scope.path}/rss.xml`)}">
<link rel="alternate" type="application/atom+xml" title="${xml(scope.title)}" href="${xml(`${SITE}${scope.path}/feed.xml`)}">`;
}

export const FEED_LINKS = `<link rel="alternate" type="application/atom+xml" title="${FEED_TITLE}" href="${SITE}/feed.xml">
<link rel="alternate" type="application/rss+xml" title="${FEED_TITLE} (RSS)" href="${SITE}/rss.xml">`;
