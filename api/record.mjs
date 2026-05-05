import { head, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES || '1';

const CORS = { 'access-control-allow-origin': '*' };
const HISTORY_BLOB = 'stock-history.json';
const MAX_EVENTS_PER_KEY = 50;
const BLOB_TIMEOUT_MS = 4000;
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

async function readHistoryFresh() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOB_TIMEOUT_MS);
  try {
    let info;
    try {
      info = await head(HISTORY_BLOB, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        abortSignal: controller.signal
      });
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return { history: {}, etag: null };
      }
      throw error;
    }
    const fetchUrl = `${info.downloadUrl || info.url}${(info.downloadUrl || info.url).includes('?') ? '&' : '?'}ts=${Date.now()}`;
    const res = await fetch(fetchUrl, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`blob fetch failed: ${res.status}`);
    const text = await res.text();
    return { history: text ? JSON.parse(text) : {}, etag: info.etag || null };
  } finally {
    clearTimeout(timer);
  }
}

function mergeEvent(history, event) {
  const { key, productId, productName, region, source, available, ts } = event;
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
    return false;
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
  return true;
}

async function writeHistory(history, etag) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOB_TIMEOUT_MS);
  try {
    await put(HISTORY_BLOB, JSON.stringify(history), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      ifMatch: etag || undefined,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      abortSignal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

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

    const { key, productId, region, available, ts } = event;
    if (!key || !productId || !region || typeof available !== 'boolean' || !ts) {
      return new Response('missing fields', { status: 400, headers: CORS });
    }

    let read;
    try {
      read = await readHistoryFresh();
    } catch (error) {
      console.error('record read error:', error?.name, error?.message, error?.stack);
      return new Response(JSON.stringify({ error: 'history unavailable, refusing to overwrite' }), {
        status: 503,
        headers: { ...CORS, 'content-type': 'application/json' }
      });
    }

    let { history, etag } = read;
    const changed = mergeEvent(history, event);
    if (!changed) {
      return new Response('ok', { status: 200, headers: CORS });
    }

    try {
      await writeHistory(history, etag);
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        try {
          read = await readHistoryFresh();
        } catch (retryError) {
          console.error('record retry read error:', retryError?.name, retryError?.message);
          return new Response(JSON.stringify({ error: 'history unavailable, refusing to overwrite' }), {
            status: 503,
            headers: { ...CORS, 'content-type': 'application/json' }
          });
        }
        history = read.history;
        etag = read.etag;
        const retryChanged = mergeEvent(history, event);
        if (!retryChanged) {
          return new Response('ok', { status: 200, headers: CORS });
        }
        try {
          await writeHistory(history, etag);
        } catch (finalError) {
          console.error('record put retry error:', finalError?.name, finalError?.message);
          return new Response(JSON.stringify({ error: finalError.message }), {
            status: 500,
            headers: { ...CORS, 'content-type': 'application/json' }
          });
        }
      } else {
        console.error('record put error:', error?.name, error?.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...CORS, 'content-type': 'application/json' }
        });
      }
    }

    return new Response('ok', { status: 200, headers: CORS });
  }
};
