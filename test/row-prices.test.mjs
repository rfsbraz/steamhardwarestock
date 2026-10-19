import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { renderProductPage, CHECKED_SCRIPT } from '../lib/landing.mjs';
import { productById, VALVE_SELLS } from '../lib/products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deck = productById('steam-deck');
const generatedAt = '2026-10-13T12:00:00.000Z';
const cellsFor = (codes) => Object.fromEntries(codes.map((cc) => [cc, { status: 'in_stock', packages: [] }]));
const statusDoc = { version: 1, generatedAt, intervalSeconds: 600, regions: VALVE_SELLS, products: { 'steam-deck': cellsFor(['US', 'GB', 'DE']) } };
const prices = {
  946113: { US: { amount: 549, currency: 'USD', formatted: '$549.00' }, GB: { amount: 479, currency: 'GBP', formatted: '£479.00' } },
  946114: { US: { amount: 649, currency: 'USD', formatted: '$649.00' } }
};

function row(html, code) {
  const m = html.match(new RegExp(`<tr>\\s*<td><a href="/steam-deck/${code.toLowerCase()}">[\\s\\S]*?</tr>`));
  assert.ok(m, `no row for ${code}`);
  return m[0];
}

test('each row shows the local price, the lowest when there are several models', () => {
  const html = renderProductPage(deck, {}, statusDoc, { prices });
  assert.match(html, /<th scope="col">Price<\/th>/);
  assert.match(row(html, 'US'), /from \$549\.00/);
  assert.match(row(html, 'GB'), /<td class="price">£479\.00<\/td>/);
});

test('no price means an empty cell, never a guessed one', () => {
  const html = renderProductPage(deck, {}, statusDoc, { prices });
  assert.match(row(html, 'DE'), /<td class="price"><\/td>/);
  assert.ok(!/\$|€/.test(row(html, 'DE').replace(/<a [^>]*>/, '')));
  const none = renderProductPage(deck, {}, statusDoc, {});
  assert.match(row(none, 'US'), /<td class="price"><\/td>/);
});

test('checked time comes from the last check, only for rows that were checked', () => {
  const html = renderProductPage(deck, {}, statusDoc, { prices });
  assert.match(row(html, 'US'), new RegExp(`<time class="checked-ago" data-cell="steam-deck:US" datetime="${generatedAt}"[^>]*>Tue, 13 Oct 2026 12:00:00 GMT</time>`));
  assert.match(row(html, 'FR'), /<td class="checked"><\/td>/, 'FR has no cell in this status doc');
  assert.match(row(html, 'JP'), /<td class="checked"><\/td>/);
  const unchecked = renderProductPage(deck, {}, null, { prices });
  assert.ok(!unchecked.includes('checked-ago"'));
});

test('the script turns the time into "N ago" from the real timestamp', () => {
  const nodes = [{ dateTime: generatedAt, textContent: 'x' }, { dateTime: 'nope', textContent: 'keep' }];
  const ctx = { document: { querySelectorAll: () => nodes }, Date: class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-10-13T12:07:30Z'])); } static now() { return Date.parse('2026-10-13T12:07:30Z'); } }, setInterval: () => {} };
  vm.runInNewContext(CHECKED_SCRIPT.replace(/<\/?script>/g, ''), ctx);
  assert.equal(nodes[0].textContent, '7 min ago');
  assert.equal(nodes[1].textContent, 'keep');
});

test('the script moves the time to the newer check in /status.json', async () => {
  const attr = (v) => () => v;
  const nodes = [{ dateTime: generatedAt, textContent: 'x', title: '', getAttribute: attr('steam-deck:US') }, { dateTime: generatedAt, textContent: 'x', title: '', getAttribute: attr('steam-deck:FR') }];
  const now = Date.parse('2026-10-15T12:03:00Z');
  const ctx = {
    document: { querySelectorAll: () => nodes },
    Date: class extends Date { static now() { return now; } },
    setInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ generatedAt: '2026-10-15T12:00:00.000Z', products: { 'steam-deck': { US: { status: 'in_stock' } } } }) })
  };
  vm.runInNewContext(CHECKED_SCRIPT.replace(/<\/?script>/g, ''), ctx);
  assert.equal(nodes[0].textContent, '2 d ago');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(nodes[0].dateTime, '2026-10-15T12:00:00.000Z');
  assert.equal(nodes[0].textContent, '3 min ago');
  assert.equal(nodes[1].dateTime, generatedAt, 'a row missing from the new check keeps its old time');
});

for (const cf of ['', '1']) {
  test(`built product pages carry the price and checked columns (CF_PAGES=${cf || 'unset'})`, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-rows-'));
    const fixture = path.join(dir, 'fx.json');
    writeFileSync(fixture, JSON.stringify({ status: statusDoc, history: {}, prices }));
    const dist = path.join(dir, 'dist');
    execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, env: { ...process.env, BUILD_DIST: dist, PRERENDER_FIXTURE: fixture, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf }, stdio: 'pipe' });
    const html = readFileSync(path.join(dist, 'steam-deck.html'), 'utf8');
    assert.match(row(html, 'GB'), /£479\.00/);
    assert.match(html, /class="checked-ago"/);
  });
}
