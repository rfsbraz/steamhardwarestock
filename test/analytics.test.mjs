import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Build output goes to os.tmpdir(); remove it after the file's tests, pass or fail.
const tmpPaths = [];
after(() => { for (const p of tmpPaths) rmSync(p, { recursive: true, force: true }); });

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

test('every built HTML page carries the GA tag and the Cloudflare beacon', () => {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-dist-'));
  tmpPaths.push(dist);
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', BUILD_DIST: dist },
    stdio: 'pipe'
  });
  const files = htmlFiles(dist);
  assert.ok(files.length > 100, `only ${files.length} HTML files built`);
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    assert.ok(html.includes('googletagmanager.com/gtag/js?id=G-D4LRTXD5LR'), `${rel} is missing the GA loader`);
    assert.ok(html.includes("gtag('config', 'G-D4LRTXD5LR')"), `${rel} is missing the GA config`);
    assert.ok(!html.includes('_vercel'), `${rel} loads a /_vercel script`);
    assert.ok(
      html.includes(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"9f338d544ab84bbc920053a6f6cf222e"}'></script>`),
      `${rel} is missing the Cloudflare Web Analytics beacon`
    );
    assert.ok(!html.includes('<!-- analytics:'), `${rel} has an unreplaced analytics marker`);
  }
});
