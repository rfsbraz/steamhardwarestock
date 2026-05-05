export const config = { runtime: 'edge' };

const REQUEST_TIMEOUT_MS = 8000;

function isAllowedProxyUrl(targetUrl) {
  if (targetUrl.protocol !== 'https:') return false;
  if (targetUrl.hostname === 'api.steampowered.com') {
    return targetUrl.pathname === '/IStoreBrowseService/GetHardwareItems/v1/';
  }
  if (targetUrl.hostname === 'store.steampowered.com') {
    return targetUrl.pathname === '/steamdeck'
      || targetUrl.pathname === '/steamdeck/'
      || targetUrl.pathname.startsWith('/hardware/')
      || targetUrl.pathname.startsWith('/sale/');
  }
  if (targetUrl.hostname === 'komodostation.com') {
    return targetUrl.pathname.startsWith('/product/');
  }
  return false;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'x-steam-tracker-proxy': '1'
};

function errJson(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errJson(405, 'Method not allowed.');
  }

  const { searchParams } = new URL(request.url);
  const rawTarget = searchParams.get('url');

  if (!rawTarget) return errJson(400, 'Missing proxy target URL.');

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    return errJson(400, 'Invalid proxy target URL.');
  }

  if (!isAllowedProxyUrl(targetUrl)) return errJson(403, 'Proxy target is not allowed.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 SteamHardwareStockTracker/1.0'
      }
    });
    clearTimeout(timer);

    const body = request.method === 'HEAD' ? null : await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        'cache-control': upstream.ok
          ? 'public, s-maxage=55, max-age=0, stale-while-revalidate=5'
          : 'no-store'
      }
    });
  } catch (error) {
    clearTimeout(timer);
    return new Response(
      JSON.stringify({ error: 'Unable to fetch Steam data.', details: error.message }),
      { status: 502, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } }
    );
  }
}
