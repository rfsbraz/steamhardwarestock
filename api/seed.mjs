import { get, put } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES || '1';

const HISTORY_BLOB = 'stock-history.json';
const BLOB_TIMEOUT_MS = 8000;

const PRODUCTS = [
  { id: 'steam-controller', name: 'Steam Controller' },
  { id: 'steam-deck', name: 'Steam Deck' },
  { id: 'steam-frame', name: 'Steam Frame' },
  { id: 'steam-machine', name: 'Steam Machine' }
];

const REGIONS = [
  'US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ',
  'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH',
  'TR', 'UA', 'AR', 'BR', 'CL', 'CO', 'MX', 'PE', 'HK', 'IN', 'ID', 'JP',
  'KZ', 'KR', 'MY', 'PH', 'TW', 'TH', 'VN', 'AE', 'IL', 'SA', 'ZA'
];

const KOMODO_REGIONS = new Set(['JP', 'KR', 'HK', 'TW']);
const KOMODO_PRODUCTS = new Set(['steam-controller', 'steam-deck']);

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    const expectedToken = process.env.SEED_TOKEN;
    if (!expectedToken) {
      return new Response('seed disabled (no SEED_TOKEN)', { status: 503 });
    }
    const authHeader = request.headers.get('authorization') || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== expectedToken) {
      return new Response('forbidden', { status: 403 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response('no blob token', { status: 503 });
    }

    let existing = {};
    let etag = null;
    let existingLoaded = false;
    const readController = new AbortController();
    const readTimer = setTimeout(() => readController.abort(), BLOB_TIMEOUT_MS);
    try {
      const result = await get(HISTORY_BLOB, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        useCache: false,
        abortSignal: readController.signal
      });
      clearTimeout(readTimer);
      if (result) {
        const text = await new Response(result.stream).text();
        existing = JSON.parse(text);
        etag = result.blob.etag || null;
      }
      existingLoaded = true;
    } catch (error) {
      clearTimeout(readTimer);
      console.error('seed read error:', error?.name, error?.message);
    }

    if (!existingLoaded) {
      return new Response(JSON.stringify({ error: 'history unavailable, refusing to overwrite' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    }

    const ts = new Date().toISOString();
    let added = 0;
    let preserved = 0;
    const merged = { ...existing };

    for (const product of PRODUCTS) {
      for (const region of REGIONS) {
        const steamKey = `${product.id}:${region}`;
        if (!merged[steamKey]) {
          merged[steamKey] = {
            productId: product.id,
            productName: product.name,
            region,
            source: 'steam',
            events: [{ ts, available: false }],
            lastOutOfStock: ts
          };
          added++;
        } else {
          preserved++;
        }

        if (KOMODO_PRODUCTS.has(product.id) && KOMODO_REGIONS.has(region)) {
          const komodoKey = `komodo:${product.id}:${region}`;
          if (!merged[komodoKey]) {
            merged[komodoKey] = {
              productId: product.id,
              productName: product.name,
              region,
              source: 'komodo',
              events: [{ ts, available: false }],
              lastOutOfStock: ts
            };
            added++;
          } else {
            preserved++;
          }
        }
      }
    }

    if (added === 0) {
      return new Response(JSON.stringify({ added: 0, preserved, skipped: 'already seeded' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const putController = new AbortController();
    const putTimer = setTimeout(() => putController.abort(), BLOB_TIMEOUT_MS);
    try {
      await put(HISTORY_BLOB, JSON.stringify(merged), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        ifMatch: etag || undefined,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        abortSignal: putController.signal
      });
      clearTimeout(putTimer);
    } catch (error) {
      clearTimeout(putTimer);
      console.error('seed put error:', error?.name, error?.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ added, preserved }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
};
