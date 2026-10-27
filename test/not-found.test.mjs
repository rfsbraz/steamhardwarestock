import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// How Cloudflare Pages answers a path no file matches: the nearest 404.html
// with a 404 status, or, when the project has no 404.html at all, index.html
// with a 200 (single-page app fallback, a soft 404).
function pagesResolve(dist, urlPath) {
  const isFile = (rel) => existsSync(path.join(dist, rel)) && statSync(path.join(dist, rel)).isFile();
  const rel = urlPath.replace(/^\/+|\/+$/g, '');
  const candidates = rel ? [rel, `${rel}.html`, `${rel}/index.html`] : ['index.html'];
  const hit = candidates.find(isFile);
  if (hit) return { status: 200, file: hit };
  const parts = rel.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const notFound = [...parts.slice(0, i), '404.html'].join('/');
    if (isFile(notFound)) return { status: 404, file: notFound };
  }
  return { status: 200, file: 'index.html', fallback: true };
}

let built;
function build() {
  if (built) return built;
  const dist = tmpDir('shs-404-');
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', PRERENDER_FIXTURE: '', CF_PAGES: '1' },
    stdio: 'pipe'
  });
  built = dist;
  return dist;
}

test('unknown routes get a 404 status and the 404 page, not the homepage', () => {
  const dist = build();
  for (const p of ['/faq', '/status', '/faq/', '/steam-frame/xx', '/no/such/page']) {
    const res = pagesResolve(dist, p);
    assert.equal(res.status, 404, `${p} answered ${res.status} with ${res.file}`);
    assert.equal(res.file, '404.html', p);
  }
});

test('real pages still answer 200', () => {
  const dist = build();
  for (const p of ['/', '/history', '/about', '/steam-frame', '/steam-frame/us', '/steam-frame/status', '/steam-deck-black-friday', '/sitemap.xml']) {
    assert.equal(pagesResolve(dist, p).status, 200, p);
  }
});

test('the 404 page is noindex, has no canonical, links home and is not in the sitemap', () => {
  const dist = build();
  const html = readFileSync(path.join(dist, '404.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /og:url/);
  assert.match(html, /<h1>[^<]*not found[^<]*<\/h1>/i);
  assert.match(html, /href="\/"/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-D4LRTXD5LR/, 'analytics, so 404 hits are visible');
  assert.doesNotMatch(readFileSync(path.join(dist, 'sitemap.xml'), 'utf8'), /404/);
});
