'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5177);
const PUBLIC_DIR = path.join(__dirname, 'public');
const REQUEST_TIMEOUT_MS = 15000;

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8']
]);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function sendError(res, status, message, details) {
  sendJson(res, status, {
    error: message,
    ...(details ? { details } : {})
  });
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 SteamHardwareStockTracker/1.0'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function isAllowedProxyUrl(targetUrl) {
  if (targetUrl.protocol !== 'https:') {
    return false;
  }

  if (targetUrl.hostname === 'api.steampowered.com') {
    return targetUrl.pathname === '/IStoreBrowseService/GetHardwareItems/v1/';
  }

  if (targetUrl.hostname === 'store.steampowered.com') {
    return (
      targetUrl.pathname === '/steamdeck' ||
      targetUrl.pathname === '/steamdeck/' ||
      targetUrl.pathname.startsWith('/hardware/') ||
      targetUrl.pathname.startsWith('/sale/')
    );
  }

  return false;
}

async function handleProxy(res, url) {
  const rawTarget = url.searchParams.get('url');
  if (!rawTarget) {
    sendError(res, 400, 'Missing proxy target URL.');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawTarget);
  } catch {
    sendError(res, 400, 'Invalid proxy target URL.');
    return;
  }

  if (!isAllowedProxyUrl(targetUrl)) {
    sendError(res, 403, 'Proxy target is not allowed.');
    return;
  }

  try {
    const response = await fetchWithTimeout(targetUrl);
    const body = await response.text();
    const contentType = response.headers.get('content-type') || 'text/plain; charset=utf-8';

    res.writeHead(response.status, {
      'content-type': contentType,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'x-steam-tracker-proxy': '1'
    });
    res.end(body);
  } catch (error) {
    sendError(res, 502, 'Unable to fetch Steam data.', error.message);
  }
}

async function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const root = path.resolve(PUBLIC_DIR);
  const resolvedPath = path.resolve(PUBLIC_DIR, relativePath);

  if (resolvedPath !== path.resolve(PUBLIC_DIR, 'index.html') && !resolvedPath.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Not a file.');
    }

    const contentType = MIME_TYPES.get(path.extname(resolvedPath).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'no-store'
    });
    fs.createReadStream(resolvedPath).pipe(res);
  } catch {
    if (pathname !== '/') {
      await serveStatic(req, res, new URL('/', `http://${req.headers.host || HOST}`));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);

    try {
      if (url.pathname === '/proxy') {
        await handleProxy(res, url);
        return;
      }

      await serveStatic(req, res, url);
    } catch (error) {
      sendError(res, 500, 'Internal server error.', error.message);
    }
  });
}

function listen(port) {
  const server = createServer();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < PORT + 20) {
      listen(port + 1);
      return;
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    console.log(`Steam hardware stock tracker running at http://${HOST}:${port}`);
  });
}

if (require.main === module) {
  listen(PORT);
}

module.exports = {
  createServer,
  isAllowedProxyUrl
};
