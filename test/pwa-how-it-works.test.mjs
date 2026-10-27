import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS } from '../lib/products.mjs';
import { EXPLAINERS, explainerFor } from '../lib/explainers.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngSize = (file) => { const b = readFileSync(file); assert.equal(b.toString('ascii', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifest has installable icons with the right sizes, including maskable', () => {
  const m = JSON.parse(readFileSync(path.join(root, 'public/site.webmanifest'), 'utf8'));
  for (const k of ['name', 'short_name', 'start_url', 'display', 'id', 'theme_color', 'background_color']) assert.ok(m[k], k);
  const find = (size, purpose) => m.icons.find((i) => i.sizes === size && i.purpose === purpose && i.type === 'image/png');
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) {
    const icon = find(size, purpose);
    assert.ok(icon, `${size} ${purpose}`);
    const [w, h] = pngSize(path.join(root, 'public', icon.src));
    assert.equal(`${w}x${h}`, size, icon.src);
  }
  assert.ok(!m.icons.some((i) => /any maskable/.test(i.purpose || '')), 'maskable and any are separate files');
  assert.deepEqual(pngSize(path.join(root, 'public/icons/apple-touch-icon.png')), [180, 180]);
});

test('every product has an explainer that links an official Valve page', () => {
  for (const p of PRODUCTS) {
    const e = explainerFor(p);
    assert.ok(e, p.id);
    assert.match(e.source, /^https:\/\/(store|help)\.steampowered\.com\//, p.id);
    assert.ok(e.points.length >= 2, p.id);
    for (const t of [e.summary, ...e.points]) assert.ok(!t.includes('—'), `em dash in ${p.id}`);
  }
  for (const id of ['steam-frame', 'steam-machine']) {
    assert.ok(EXPLAINERS[id].points.some((t) => /72 hours/.test(t)), `${id} explains the 72 hour window`);
    assert.ok(EXPLAINERS[id].points.some((t) => /waitlist/i.test(t)), `${id} explains the waitlist`);
  }
  const pad = EXPLAINERS['steam-controller'];
  assert.ok(pad.points.some((t) => /72 hours/.test(t)), 'controller explains the 72 hour window');
  assert.equal(pad.update?.url, 'https://store.steampowered.com/news/group/45479024/view/697641379212297809');
  assert.match(pad.update?.date, /^2026-06-18$/);
});

function build(cf) {
  const dist = tmpDir('shs-pwa-');
  execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf }, stdio: 'pipe' });
  return dist;
}
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []));

for (const cf of ['', '1']) {
  test(`build has the How it works page, sitemap entry, explainers and manifest links (CF_PAGES=${cf || 'unset'})`, () => {
    const dist = build(cf);
    const how = readFileSync(path.join(dist, 'how-it-works.html'), 'utf8');
    assert.match(how, /<title>[^<]*How it works[^<]*<\/title>/i);
    assert.match(how, /<link rel="canonical" href="https:\/\/steamhardwarestock\.com\/how-it-works">/);
    for (const label of ['In stock', 'Reservations open', 'Waitlist', 'Out of stock', 'Not sold here']) assert.ok(how.includes(label), label);
    assert.match(how, /every 10 minutes/);
    assert.ok(!how.includes('—'));
    assert.match(readFileSync(path.join(dist, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/steamhardwarestock\.com\/how-it-works<\/loc>/);
    const frame = readFileSync(path.join(dist, 'steam-frame.html'), 'utf8');
    assert.match(frame, /id="status-explained"/);
    assert.match(frame, /72 hours/);
    const pad = readFileSync(path.join(dist, 'steam-controller.html'), 'utf8');
    assert.match(pad, /72 hours/);
    assert.match(pad, /href="https:\/\/store\.steampowered\.com\/news\/group\/45479024\/view\/697641379212297809"/);
    assert.match(frame, /href="https:\/\/store\.steampowered\.com\/hardware\/steamframe\/"/);
    for (const f of walk(dist)) {
      const html = readFileSync(f, 'utf8');
      if (html.includes('http-equiv="refresh"')) continue;
      assert.ok(html.includes('<link rel="manifest" href="/site.webmanifest">'), `${f} manifest`);
      assert.ok(html.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">'), `${f} apple icon`);
    }
    for (const n of ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) assert.ok(existsSync(path.join(dist, 'icons', n)), n);
  });
}
