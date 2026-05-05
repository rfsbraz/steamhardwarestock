const CORS = { 'access-control-allow-origin': '*' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'content-type' } });
  }
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: CORS });
  }
  return new Response(JSON.stringify({ debug: 'no blob import', hasToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN) }), {
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' }
  });
}
