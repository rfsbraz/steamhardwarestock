import { BlobPreconditionFailedError } from '@vercel/blob';
import { readHistoryFresh, mergeEvent, writeHistory } from '../record.mjs';

const CORS = { 'access-control-allow-origin': '*' };
const STEAM_API = 'https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/';
const BATCH_SIZE = 10;
const FETCH_TIMEOUT_MS = 8000;

const PRODUCTS = [
  { id: 'steam-controller', name: 'Steam Controller', packageIds: [1558609] },
  { id: 'steam-deck', name: 'Steam Deck', packageIds: [946113, 946114] },
  { id: 'steam-dock', name: 'Steam Deck Dock', packageIds: [761892] }
];

const REGIONS = [
  'US', 'CA', 'GB', 'IE', 'AU', 'NZ', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ',
  'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH',
  'TR', 'UA', 'AR', 'BR', 'CL', 'CO', 'MX', 'PE', 'HK', 'IN', 'ID', 'JP',
  'KZ', 'KR', 'MY', 'PH', 'TW', 'TH', 'VN', 'AE', 'IL', 'SA', 'ZA'
];

async function fetchStock(product, region) {
  const input = {
    packageid: product.packageIds,
    context: { country_code: region, language: 'english' }
  };
  const url = `${STEAM_API}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`steam ${res.status}`);
    const payload = await res.json();
    const details = payload?.response?.details || [];
    return details.some((d) =>
      d
      && d.allow_purchase_in_country !== false
      && !d.account_restricted_from_purchasing
      && !d.requires_reservation
      && !d.high_pending_orders
      && d.inventory_available
    );
  } finally {
    clearTimeout(timer);
  }
}

async function checkAll() {
  const pairs = [];
  for (const product of PRODUCTS) {
    for (const region of REGIONS) {
      pairs.push({ product, region });
    }
  }

  const results = [];
  const errors = [];
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    const batch = pairs.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map(async (pair) => ({
      ...pair,
      available: await fetchStock(pair.product, pair.region)
    })));
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        errors.push({ product: batch[j].product.id, region: batch[j].region, error: String(s.reason?.message || s.reason) });
      }
    }
  }
  return { results, errors, total: pairs.length };
}

function applyAll(history, results, ts) {
  let transitions = 0;
  for (const { product, region, available } of results) {
    const key = `${product.id}:${region}`;
    const changed = mergeEvent(history, {
      key,
      productId: product.id,
      productName: product.name,
      region,
      source: 'steam',
      available,
      ts
    });
    if (changed) transitions++;
  }
  return transitions;
}

export default {
  async fetch(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return new Response('CRON_SECRET not configured', { status: 503, headers: CORS });
    }
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${expected}`) {
      return new Response('unauthorized', { status: 401, headers: CORS });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response('no storage configured', { status: 503, headers: CORS });
    }

    const { results, errors, total } = await checkAll();
    const ts = new Date().toISOString();

    let read;
    try {
      read = await readHistoryFresh();
    } catch (error) {
      console.error('cron read error:', error?.name, error?.message);
      return new Response(JSON.stringify({ error: 'history unavailable' }), {
        status: 503,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }

    let { history, etag } = read;
    let transitions = applyAll(history, results, ts);

    if (transitions === 0) {
      return new Response(JSON.stringify({ checked: results.length, transitions: 0, errors: errors.length, total }), {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }

    try {
      await writeHistory(history, etag);
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        try {
          read = await readHistoryFresh();
        } catch (retryError) {
          console.error('cron retry read error:', retryError?.name, retryError?.message);
          return new Response(JSON.stringify({ error: 'history unavailable on retry' }), {
            status: 503,
            headers: { ...CORS, 'content-type': 'application/json' }
          });
        }
        history = read.history;
        etag = read.etag;
        transitions = applyAll(history, results, ts);
        if (transitions === 0) {
          return new Response(JSON.stringify({ checked: results.length, transitions: 0, errors: errors.length, total }), {
            status: 200,
            headers: { ...CORS, 'content-type': 'application/json' }
          });
        }
        await writeHistory(history, etag);
      } else {
        console.error('cron write error:', error?.name, error?.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS, 'content-type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ checked: results.length, transitions, errors: errors.length, total }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' }
    });
  }
};
