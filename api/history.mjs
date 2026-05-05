import { list } from '@vercel/blob';

const CORS = { 'access-control-allow-origin': '*' };
const HISTORY_BLOB = 'stock-history.json';

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'content-type' } });
  }

  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: CORS });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }

  try {
    const { blobs } = await list({ prefix: HISTORY_BLOB, token: process.env.BLOB_READ_WRITE_TOKEN });
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
  } catch {
    return new Response('{}', { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  }
}
