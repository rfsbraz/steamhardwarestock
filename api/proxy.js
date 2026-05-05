'use strict';

const REQUEST_TIMEOUT_MS = 10000;

function getTargetFromQuery(query) {
  const raw = query && query.url;
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

function isAllowedProxyUrl(targetUrl) {
  if (targetUrl.protocol !== 'https:') {
    return false;
  }

  if (targetUrl.hostname === 'api.steampowered.com') {
    return targetUrl.pathname === '/IStoreBrowseService/GetHardwareItems/v1/';
  }

  if (targetUrl.hostname === 'store.steampowered.com') {
    return targetUrl.pathname === '/steamdeck'
      || targetUrl.pathname === '/steamdeck/'
      || targetUrl.pathname.startsWith('/hardware/')
      || targetUrl.pathname.startsWith('/sale/');
  }

  return false;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'accept': 'application/json,text/html;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 SteamHardwareStockTracker/1.0'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,HEAD,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('x-steam-tracker-proxy', '1');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const rawTarget = getTargetFromQuery(req.query);
  if (!rawTarget) {
    sendJson(res, 400, { error: 'Missing proxy target URL.' });
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    sendJson(res, 400, { error: 'Invalid proxy target URL.' });
    return;
  }

  if (!isAllowedProxyUrl(targetUrl)) {
    sendJson(res, 403, { error: 'Proxy target is not allowed.' });
    return;
  }

  try {
    const response = await fetchWithTimeout(targetUrl);
    const body = await response.text();
    res.statusCode = response.status;
    res.setHeader('content-type', response.headers.get('content-type') || 'text/plain; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(req.method === 'HEAD' ? '' : body);
  } catch (error) {
    sendJson(res, 502, {
      error: 'Unable to fetch Steam data.',
      details: error.message
    });
  }
};
