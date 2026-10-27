import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prerenderHome } from '../scripts/prerender.mjs';
import { REGIONS, VALVE_SELLS } from '../lib/products.mjs';
import { CHECKED_REGIONS } from '../lib/steam.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'public/index.html'), 'utf8');
const status = { version: 1, generatedAt: '2026-10-13T12:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products: { 'steam-deck': { US: { status: 'in_stock', packages: [] }, GB: { status: 'out_of_stock', packages: [] } }, 'steam-frame': { US: { status: 'waitlist', packages: [] } } } };
const history = { 'steam-deck:US': { events: [{ ts: '2026-10-12T08:00:00.000Z', available: true, status: 'in_stock' }] } };
const words = (html) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

test('the homepage H1 has no link and carries the real country count', () => {
  const html = prerenderHome(source, status, history);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  assert.ok(!/<a\b/.test(h1), 'no link inside the H1');
  assert.equal(h1, `Steam Hardware Tracker: Stock and Reservation Status in ${CHECKED_REGIONS.length} Countries`);
  assert.notEqual(CHECKED_REGIONS.length, REGIONS.length, 'counts checked regions, not every country page');
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<a href="\/history"[^>]*>[^<]*history/i, 'History is still linked near the top');
});

test('the count follows the data, not a constant', () => {
  const fewer = prerenderHome(source, status, history, { regions: CHECKED_REGIONS.slice(0, 7) });
  assert.match(fewer, /Status in 7 Countries<\/h1>/);
  assert.ok(!/\b55\b/.test(source), 'no hard-coded 55 in index.html');
});

test('a 150 to 300 word intro is in the HTML, with numbers from the data', () => {
  const html = prerenderHome(source, status, history);
  const intro = html.match(/<section class="home-intro"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(intro, 'intro section rendered');
  const n = words(intro[1]);
  assert.ok(n >= 150 && n <= 300, `${n} words`);
  assert.ok(intro[1].includes(`${VALVE_SELLS.length} countries`), 'mentions the Steam country count');
  assert.ok(!intro[1].includes('—'));
  assert.ok(!source.includes('class="home-intro"'), 'the source page has only a marker');
});

test('JSON-LD has dateModified from the last stock change, or the last check', () => {
  const ld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld(prerenderHome(source, status, history)).dateModified, '2026-10-12T08:00:00.000Z');
  assert.equal(ld(prerenderHome(source, status, {})).dateModified, '2026-10-13T12:00:00.000Z');
  assert.ok(!('dateModified' in ld(prerenderHome(source, null, {}))));
});

for (const cf of ['', '1']) {
  test(`built homepage has the new H1, intro and dateModified (CF_PAGES=${cf || 'unset'})`, () => {
    const dir = tmpDir('shs-home-');
    writeFileSync(path.join(dir, 'fx.json'), JSON.stringify({ status, history, prices: {} }));
    execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: path.join(dir, 'd'), PRERENDER_FIXTURE: path.join(dir, 'fx.json'), PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf }, stdio: 'pipe' });
    const html = readFileSync(path.join(dir, 'd', 'index.html'), 'utf8');
    assert.match(html, new RegExp(`Status in ${CHECKED_REGIONS.length} Countries</h1>`));
    assert.match(html, /class="home-intro"/);
    assert.match(html, /"dateModified":\s*"2026-10-12T08:00:00.000Z"/);
  });
}

test('checker and homepage share one region list', () => {
  assert.deepEqual(CHECKED_REGIONS, VALVE_SELLS);
  const html = prerenderHome(source, status, history);
  const intro = html.match(/<section class="home-intro"[\s\S]*?<\/section>/)[0];
  assert.ok(!intro.includes(`${REGIONS.length} countries`), 'never claims the full country list');
  assert.ok(intro.includes(`checks ${CHECKED_REGIONS.length} countries`));
});
