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

function cacheControlFor(targetUrl) {
  if (targetUrl.hostname === 'komodostation.com') {
    return 'public, s-maxage=120, max-age=0, stale-while-revalidate=180';
  }
  return 'public, s-maxage=25, max-age=0, stale-while-revalidate=60';
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
  const rawMaxBytes = searchParams.get('maxBytes');
  const maxBytes = rawMaxBytes ? Math.min(Math.max(parseInt(rawMaxBytes, 10) || 0, 0), 524288) : 0;

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

    const fullBody = request.method === 'HEAD' ? null : await upstream.text();
    const body = (maxBytes && fullBody && fullBody.length > maxBytes) ? fullBody.slice(0, maxBytes) : fullBody;

    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS,
        'content-type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        'cache-control': upstream.ok ? cacheControlFor(targetUrl) : 'no-store'
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Unable to fetch Steam data.', details: error.message }),
      { status: 502, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } }
    );
  } finally {
    clearTimeout(timer);
  }
}
