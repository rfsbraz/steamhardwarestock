import { list, put } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES || '1';

const CORS = { 'access-control-allow-origin': '*' };
const HISTORY_BLOB = 'stock-history.json';
const MAX_EVENTS_PER_KEY = 50;
const BLOB_TIMEOUT_MS = 4000;
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
    }

    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: CORS });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response('no storage configured', { status: 503, headers: CORS });
    }

    let event;
    try {
      event = await request.json();
    } catch {
      return new Response('invalid json', { status: 400, headers: CORS });
    }

    const { key, productId, productName, region, source, available, ts } = event;
    if (!key || !productId || !region || typeof available !== 'boolean' || !ts) {
      return new Response('missing fields', { status: 400, headers: CORS });
    }

    let history = {};
    let historyLoaded = false;
    const listController = new AbortController();
    const listTimer = setTimeout(() => listController.abort(), BLOB_TIMEOUT_MS);
    try {
      const { blobs } = await list({
        prefix: HISTORY_BLOB,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        abortSignal: listController.signal
      });
      clearTimeout(listTimer);
      if (blobs.length) {
        const res = await fetch(`${blobs[0].url}?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`blob fetch failed: ${res.status}`);
        history = await res.json();
      }
      historyLoaded = true;
    } catch (error) {
      clearTimeout(listTimer);
      console.error('record list error:', error?.name, error?.message);
    }

    if (!historyLoaded) {
      return new Response(JSON.stringify({ error: 'history unavailable, refusing to overwrite' }), {
        status: 503,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }

    const entry = history[key] || {
      productId,
      productName,
      region,
      source: source || 'steam',
      events: []
    };

    const last = entry.events[0];
    const tsMs = Date.parse(ts);
    if (
      last
      && last.available === available
      && Number.isFinite(tsMs)
      && Number.isFinite(Date.parse(last.ts))
      && tsMs - Date.parse(last.ts) < DEDUP_WINDOW_MS
    ) {
      return new Response('ok', { status: 200, headers: CORS });
    }

    if (available) {
      entry.lastInStock = ts;
    } else {
      entry.lastOutOfStock = ts;
    }

    entry.events.unshift({ ts, available });
    if (entry.events.length > MAX_EVENTS_PER_KEY) {
      entry.events.length = MAX_EVENTS_PER_KEY;
    }

    history[key] = entry;

    const putController = new AbortController();
    const putTimer = setTimeout(() => putController.abort(), BLOB_TIMEOUT_MS);
    try {
      await put(HISTORY_BLOB, JSON.stringify(history), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        abortSignal: putController.signal
      });
      clearTimeout(putTimer);
    } catch (error) {
      clearTimeout(putTimer);
      console.error('record put error:', error?.name, error?.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    return new Response('ok', { status: 200, headers: CORS });
  }
};
