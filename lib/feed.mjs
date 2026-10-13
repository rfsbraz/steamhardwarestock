// Atom and RSS feeds of stock changes, built from the KV stock history.
// Served by functions/feed.xml.js and functions/rss.xml.js. Read only.
import StockStatus from '../public/stock-status.js';
import { SITE } from './site.mjs';
import { productById, regionByCode } from './products.mjs';

export const FEED_LIMIT = 50;
export const FEED_TITLE = 'Steam hardware stock changes';
export const FEED_CACHE = 'public, max-age=300, s-maxage=600, stale-while-revalidate=600';
const EPOCH = '1970-01-01T00:00:00.000Z';

const xml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function feedEvents(history, limit = FEED_LIMIT) {
  const out = [];
  for (const [key, entry] of Object.entries(history || {})) {
    if (!entry || !Array.isArray(entry.events)) continue;
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

export function buildAtom(history) {
  const events = feedEvents(history);
  const entries = events.map((e) => `  <entry>
    <id>${xml(e.id)}</id>
    <title>${xml(e.title)}</title>
    <updated>${e.ts}</updated>
    <link rel="alternate" type="text/html" href="${xml(e.link)}"/>
    <summary>${xml(e.summary)}</summary>
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE}/feed.xml</id>
  <title>${xml(FEED_TITLE)}</title>
  <subtitle>Official Steam store stock changes for Steam Deck, Frame, Machine, Controller and Dock, by country.</subtitle>
  <updated>${events[0]?.ts || EPOCH}</updated>
  <link rel="self" type="application/atom+xml" href="${SITE}/feed.xml"/>
  <link rel="alternate" type="text/html" href="${SITE}/history"/>
  <author><name>Steam Hardware Stock Tracker</name></author>
${entries}
</feed>
`;
}

export function buildRss(history) {
  const events = feedEvents(history);
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
    <title>${xml(FEED_TITLE)}</title>
    <link>${SITE}/history</link>
    <description>Official Steam store stock changes, by country.</description>
    <atom:link rel="self" type="application/rss+xml" href="${SITE}/rss.xml"/>
    <lastBuildDate>${new Date(events[0]?.ts || EPOCH).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export const FEED_LINKS = `<link rel="alternate" type="application/atom+xml" title="${FEED_TITLE}" href="${SITE}/feed.xml">
<link rel="alternate" type="application/rss+xml" title="${FEED_TITLE} (RSS)" href="${SITE}/rss.xml">`;
