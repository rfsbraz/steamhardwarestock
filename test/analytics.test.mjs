import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

test('every built HTML page carries the GA tag and Vercel Analytics', () => {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-dist-'));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, PRERENDER_OFFLINE: '1', BLOB_READ_WRITE_TOKEN: '', PRERENDER_SOURCE_URL: '', BUILD_DIST: dist },
    stdio: 'pipe'
  });
  const files = htmlFiles(dist);
  assert.ok(files.length > 100, `only ${files.length} HTML files built`);
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    assert.ok(html.includes('googletagmanager.com/gtag/js?id=G-D4LRTXD5LR'), `${rel} is missing the GA loader`);
    assert.ok(html.includes("gtag('config', 'G-D4LRTXD5LR')"), `${rel} is missing the GA config`);
    assert.ok(html.includes('/_vercel/insights/script.js'), `${rel} is missing Vercel Analytics`);
    assert.ok(!html.includes('<!-- analytics:'), `${rel} has an unreplaced analytics marker`);
  }
});
