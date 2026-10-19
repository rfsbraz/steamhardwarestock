import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://steamhardwarestock.com';

// How Cloudflare Pages answers a path from the static files (html_handling
// "auto-trailing-slash"): /x is served from x.html, while x/index.html is only
// served at /x/ and /x gets a 308 to it. Returns the status and file served.
function pagesResolve(dist, urlPath) {
  const isFile = (rel) => existsSync(path.join(dist, rel)) && statSync(path.join(dist, rel)).isFile();
  if (urlPath === '/') return isFile('index.html') ? { status: 200, file: 'index.html' } : { status: 404 };
  const rel = urlPath.slice(1);
  if (urlPath.endsWith('/')) {
    const dir = rel.slice(0, -1);
    if (isFile(`${dir}.html`)) return { status: 308, location: `/${dir}` };
    if (isFile(`${dir}/index.html`)) return { status: 200, file: `${dir}/index.html` };
    return { status: 404 };
  }
  if (rel.endsWith('.html')) return { status: 308, location: `/${rel.replace(/(index)?\.html$/, '')}` };
  if (isFile(rel)) return { status: 200, file: rel };
  if (isFile(`${rel}.html`)) return { status: 200, file: `${rel}.html` };
  if (isFile(`${rel}/index.html`)) return { status: 308, location: `${urlPath}/` };
  return { status: 404 };
}

let built;
function build() {
  if (built) return built;
  const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-slash-'));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', PRERENDER_FIXTURE: '', CF_PAGES: '1' },
    stdio: 'pipe'
  });
  const locs = [...readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  built = { dist, locs };
  return built;
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

test('every sitemap URL is served with 200, no redirect, and its canonical is that URL', () => {
  const { dist, locs } = build();
  assert.ok(locs.length > 100);
  const bad = [];
  for (const loc of locs) {
    const urlPath = loc.slice(SITE.length) || '/';
    const res = pagesResolve(dist, urlPath);
    if (res.status !== 200) { bad.push(`${urlPath} ${res.status} ${res.location || ''}`); continue; }
    const canonical = (readFileSync(path.join(dist, res.file), 'utf8').match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    if (canonical !== loc) bad.push(`${urlPath} canonical ${canonical}`);
  }
  assert.deepEqual(bad, []);
});

test('internal page links point straight at a page, not at a redirect', () => {
  const { dist } = build();
  const bad = new Set();
  for (const file of htmlFiles(dist)) {
    for (const [, href] of readFileSync(file, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) {
      if (path.extname(href)) continue; // assets, feeds, sitemap
      const res = pagesResolve(dist, href);
      if (res.status === 308) bad.add(`${href} -> ${res.location}`);
    }
  }
  assert.deepEqual([...bad], []);
});

test('the slash form of a page redirects to the canonical no-slash URL', () => {
  const { dist } = build();
  for (const p of ['/steam-frame/', '/steam-frame/us/', '/about/', '/history/', '/steam-deck-black-friday/']) {
    assert.deepEqual(pagesResolve(dist, p), { status: 308, location: p.slice(0, -1) }, p);
  }
});
