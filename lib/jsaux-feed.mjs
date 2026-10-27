// Build-time reader for the public JSAUX (Shopify) product feed. Picks a few
// products per tracker page and copies their images into the build, so the
// pages never load anything from JSAUX or Shopify at runtime.
import fs from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'https://jsaux.com';
const FEED_PATH = '/collections/all/products.json';
const PAGE_SIZE = 250;
const MAX_PAGES = 4;
const IMAGE_WIDTH = '320';
const IMAGE_HOSTS = new Set(['cdn.shopify.com', 'jsaux.com']);
const IMAGE_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const MAX_IMAGE_BYTES = 200_000;
const TIMEOUT_MS = 15_000;

// Hand-picked handles per page, in display order. Extras are backups for
// when one sells out. No Valve Index entry: JSAUX sells nothing for it.
export const DEAL_PICKS = {
  'steam-deck': [
    'steam-deck-docking-station',
    'double-decker-travel-supply-case-for-steam-deck',
    'steam-deck-screen-protector-1',
    'usb-c-pd-charger-for-steam-deck-ch6504-ch4504',
    'silicone-grip-for-steam-deck'
  ],
  'steam-dock': [
    'steam-deck-docking-station',
    'upgraded-docking-station-for-steam-deck',
    'rgb-docking-station-for-steam-deck',
    '7-in-1-rgb-cooling-docking-station'
  ],
  'steam-controller': [
    'travel-carrying-case-for-steam-controller',
    'dual-energy-station-for-steam-controller'
  ]
};
export const MAX_DEALS = 4;

// Steam hardware only, even if a pick later gets retitled for other handhelds.
const OTHER_HARDWARE = /switch|ally|legion/i;

function cents(value) {
  const n = Math.round(Number(value) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Price is the cheapest in-stock variant. It is a sale only when that
// variant's compare_at_price is higher.
export function dealFrom(product) {
  if (!product || typeof product.handle !== 'string' || typeof product.title !== 'string') return null;
  if (OTHER_HARDWARE.test(product.title)) return null;
  const image = product.images?.[0]?.src;
  if (typeof image !== 'string') return null;
  const offers = (product.variants || [])
    .filter((v) => v?.available === true && cents(v.price))
    .map((v) => ({ price: cents(v.price), was: cents(v.compare_at_price) }))
    .sort((a, b) => a.price - b.price || (b.was || 0) - (a.was || 0));
  if (!offers.length) return null;
  const { price, was } = offers[0];
  return {
    handle: product.handle,
    title: product.title,
    url: `${ORIGIN}/products/${encodeURIComponent(product.handle)}`,
    price,
    was: was && was > price ? was : null,
    image
  };
}

export function pickDeals(products, picks = DEAL_PICKS) {
  const byHandle = new Map(products.map((p) => [p?.handle, p]));
  const pages = {};
  for (const [page, handles] of Object.entries(picks)) {
    const deals = handles.map((h) => dealFrom(byHandle.get(h))).filter(Boolean).slice(0, MAX_DEALS);
    if (deals.length) pages[page] = deals;
  }
  return pages;
}

async function fetchCatalog(fetchImpl) {
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(FEED_PATH, ORIGIN);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`products.json page ${page}: ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.products)) throw new Error('products.json has no products list');
    products.push(...body.products);
    if (body.products.length < PAGE_SIZE) break;
  }
  return products;
}

// Asks the Shopify CDN for a 320px copy and saves it as /deals/<handle>.<ext>.
async function copyImage(fetchImpl, src, handle, outDir) {
  const url = new URL(src);
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) throw new Error(`unexpected image host ${url.hostname}`);
  url.searchParams.set('width', IMAGE_WIDTH);
  const res = await fetchImpl(url, { headers: { accept: 'image/webp,image/png,image/jpeg' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const ext = IMAGE_TYPES[(res.headers.get('content-type') || '').split(';')[0].trim()];
  if (!ext) throw new Error('image is not webp, png or jpeg');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error(`image is ${bytes.length} bytes`);
  const name = `${handle.replace(/[^a-z0-9-]/gi, '')}.${ext}`;
  await fs.writeFile(path.join(outDir, name), bytes);
  return `/deals/${name}`;
}

// Returns { checkedAt, pages: { productId: [deal] } } with local image paths,
// or null when nothing usable came back. null means the text links stay.
export async function loadDeals({ fetchImpl = (...a) => fetch(...a), outDir, now = new Date() }) {
  try {
    const candidates = pickDeals(await fetchCatalog(fetchImpl));
    await fs.mkdir(outDir, { recursive: true });
    const images = new Map();
    const pages = {};
    for (const [page, deals] of Object.entries(candidates)) {
      const kept = [];
      for (const deal of deals) {
        if (!images.has(deal.handle)) {
          images.set(deal.handle, await copyImage(fetchImpl, deal.image, deal.handle, outDir).catch((error) => {
            console.warn(`jsaux feed: no image for ${deal.handle}:`, error?.message);
            return null;
          }));
        }
        const image = images.get(deal.handle);
        if (image) kept.push({ ...deal, image });
      }
      if (kept.length) pages[page] = kept;
    }
    return Object.keys(pages).length ? { checkedAt: now.toISOString(), pages } : null;
  } catch (error) {
    console.warn('jsaux feed unavailable, keeping the text links:', error?.message);
    return null;
  }
}
