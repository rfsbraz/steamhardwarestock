import { head, put, BlobNotFoundError } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES || '1';

const HISTORY_BLOB = 'stock-history.json';
export const STATUS_BLOB = 'status.json';
const MAX_EVENTS_PER_KEY = 50;
const BLOB_TIMEOUT_MS = 4000;

export async function readHistoryFresh() {
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

export function mergeEvent(history, event) {
  const { key, productId, productName, region, source, available, status, ts } = event;
  const entry = history[key] || {
    productId,
    productName,
    region,
    source: source || 'steam',
    events: []
  };

  const last = entry.events[0];
  // Events written before statuses existed only carry `available`.
  const lastStatus = last ? last.status || (last.available ? 'in_stock' : 'out_of_stock') : null;
  const sameStatus = !status || lastStatus === status;
  if (last && last.available === available && sameStatus) {
    return false;
  }

  if (available) {
    entry.lastInStock = ts;
  } else {
    entry.lastOutOfStock = ts;
  }

  entry.events.unshift(status ? { ts, available, status } : { ts, available });
  if (status) entry.status = status;
  if (entry.events.length > MAX_EVENTS_PER_KEY) {
    entry.events.length = MAX_EVENTS_PER_KEY;
  }

  history[key] = entry;
  return true;
}

export async function writeHistory(history, etag) {
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

// status.json is rewritten on every cron run, last write wins.
export async function writeStatus(doc) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOB_TIMEOUT_MS);
  try {
    await put(STATUS_BLOB, JSON.stringify(doc), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      abortSignal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function readStatusText() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BLOB_TIMEOUT_MS);
  try {
    let info;
    try {
      info = await head(STATUS_BLOB, { token: process.env.BLOB_READ_WRITE_TOKEN, abortSignal: controller.signal });
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
    const url = info.downloadUrl || info.url;
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`blob fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
