import { list } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES || '1';

const CORS = { 'access-control-allow-origin': '*' };
const HISTORY_BLOB = 'stock-history.json';
const BLOB_TIMEOUT_MS = 4000;

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'content-type' } });
    }

    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: CORS });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BLOB_TIMEOUT_MS);

    try {
      const { blobs } = await list({
        prefix: HISTORY_BLOB,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        abortSignal: controller.signal
      });
      clearTimeout(timer);

      if (!blobs.length) {
        return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
      }

      const upstream = await fetch(blobs[0].url);
      if (!upstream.ok) throw new Error(`blob fetch failed: ${upstream.status}`);
      const body = await upstream.text();

      return new Response(body, {
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'application/json',
          'cache-control': 'public, s-maxage=30, stale-while-revalidate=60'
        }
      });
    } catch (error) {
      clearTimeout(timer);
      console.error('history blob error:', error?.name, error?.message);
      return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }
  }
};
