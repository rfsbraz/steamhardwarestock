import { head, BlobNotFoundError, BlobServiceRateLimited } from '@vercel/blob';

process.env.VERCEL_BLOB_RETRIES = process.env.VERCEL_BLOB_RETRIES || '1';

const CORS = { 'access-control-allow-origin': '*' };
const HISTORY_BLOB = 'stock-history.json';
const BLOB_TIMEOUT_MS = 4000;

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'content-type' }
      });
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
      let info;
      try {
        info = await head(HISTORY_BLOB, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
          abortSignal: controller.signal
        });
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          clearTimeout(timer);
          return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
        }
        throw error;
      }

      const upstream = await fetch(info.downloadUrl || info.url, { cache: 'no-store', signal: controller.signal });
      if (!upstream.ok) throw new Error(`blob fetch failed: ${upstream.status}`);
      const body = await upstream.text();
      clearTimeout(timer);

      return new Response(body, {
        status: 200,
        headers: {
          ...CORS,
          'content-type': 'application/json',
          'cache-control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof BlobServiceRateLimited) {
        const retryAfter = Math.max(1, Number(error.retryAfter) || 1);
        return new Response('{}', {
          status: 200,
          headers: { ...CORS, 'content-type': 'application/json', 'cache-control': `public, s-maxage=${retryAfter}` }
        });
      }
      console.error('history blob error:', error?.name, error?.message);
      return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
    }
  }
};
