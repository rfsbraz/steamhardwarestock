import { list, put } from '@vercel/blob';

const CORS = { 'access-control-allow-origin': '*' };
const HISTORY_BLOB = 'stock-history.json';
const MAX_EVENTS_PER_KEY = 200;
const BLOB_TIMEOUT_MS = 5000;

export default async function handler(request) {
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

  const { key, productId, productName, region, source, available, label, ts } = event;
  if (!key || !productId || !region || typeof available !== 'boolean' || !ts) {
    return new Response('missing fields', { status: 400, headers: CORS });
  }

  let history = {};
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
      const res = await fetch(blobs[0].url);
      if (res.ok) history = await res.json();
    }
  } catch {
    clearTimeout(listTimer);
  }

  const entry = history[key] || {
    productId,
    productName,
    region,
    source: source || 'steam',
    events: []
  };

  if (available) {
    entry.lastInStock = ts;
  } else {
    entry.lastOutOfStock = ts;
  }

  entry.events.unshift({ ts, available, label });
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
      token: process.env.BLOB_READ_WRITE_TOKEN,
      abortSignal: putController.signal
    });
    clearTimeout(putTimer);
  } catch (error) {
    clearTimeout(putTimer);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  }

  return new Response('ok', { status: 200, headers: CORS });
}
