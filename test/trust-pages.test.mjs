import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INFO_PAGES, renderInfoPage } from '../lib/landing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = ['/how-it-works', '/about', '/methodology', '/disclosures'];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []));
const words = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

test('the info pages are listed once each', () => {
  assert.deepEqual(INFO_PAGES.map((p) => p.path).sort(), [...PATHS].sort());
});

for (const cf of ['', '1']) {
  test(`About, Methodology and Disclosures are built, in the sitemap and in every footer (CF_PAGES=${cf || 'unset'})`, () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-trust-'));
    execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf }, stdio: 'pipe' });
    const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
    for (const p of PATHS) {
      const html = readFileSync(path.join(dist, `${p.slice(1)}.html`), 'utf8');
      assert.match(html, new RegExp(`<link rel="canonical" href="https://steamhardwarestock.com${p}">`));
      assert.equal((html.match(/<h1\b/g) || []).length, 1, p);
      assert.ok(words(html) > 150, `${p} is thin`);
      assert.ok(!html.includes('—'), `${p} has an em dash`);
      assert.match(sitemap, new RegExp(`<loc>https://steamhardwarestock.com${p}</loc>`));
    }
    const disc = readFileSync(path.join(dist, 'disclosures.html'), 'utf8');
    assert.match(disc, /no affiliate links at the moment/, 'default build has no affiliate IDs');
    assert.ok(!disc.includes('Amazon Associate'));
    assert.match(disc, /Consent Mode/);
    assert.match(disc, /data-consent-settings/, 'links the consent controls');
    assert.match(disc, /not affiliated with Valve/i);
    const method = readFileSync(path.join(dist, 'methodology.html'), 'utf8');
    for (const field of ['inventory_available', 'allow_purchase_in_country', 'requires_reservation', 'high_pending_orders']) assert.ok(method.includes(field), field);
    for (const f of walk(dist)) {
      const html = readFileSync(f, 'utf8');
      if (!html.includes('site-footer')) continue;
      for (const p of ['/about', '/methodology', '/disclosures']) assert.ok(html.includes(`href="${p}"`), `${path.relative(dist, f)} footer misses ${p}`);
    }
  });
}

test('with affiliate IDs set, Disclosures names the partners and the commission', () => {
  const page = INFO_PAGES.find((p) => p.path === '/disclosures');
  const on = renderInfoPage(page, { affiliate: { jsaux: { refId: 'x' }, amazon: { enabled: true, tag: 't-20' } } });
  assert.match(on, /JSAUX/);
  assert.match(on, /commission at no extra cost/);
  assert.match(on, /As an Amazon Associate I earn from qualifying purchases/);
  const jsauxOnly = renderInfoPage(page, { affiliate: { jsaux: { refId: 'x' }, amazon: { enabled: false, tag: '' } } });
  assert.ok(!jsauxOnly.includes('Amazon'));
});
