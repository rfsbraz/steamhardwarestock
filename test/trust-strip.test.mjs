import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { renderProductPage, renderRegionPage, CHECKED_SCRIPT } from '../lib/landing.mjs';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';

// Trimmed from the live status.json, history and prices of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const region = Object.fromEntries(REGIONS.map((r) => [r.code, r]));
const page = (id, doc = fx.status) => renderProductPage(byId[id], fx.history, doc, { prices: fx.prices });
const regionPage = (id, cc) => renderRegionPage(byId[id], region[cc], fx.history, fx.status, { prices: fx.prices });
const strip = (html) => html.match(/<div class="trust" role="note">[\s\S]*?<\/div>/)?.[0] || '';

test('product and country pages swap the static last check for the trust strip', () => {
  for (const html of [page('steam-deck'), page('steam-dock'), regionPage('steam-controller', 'US'), regionPage('steam-deck', 'JP')]) {
    assert.ok(strip(html), 'has the strip');
    assert.ok(!html.includes('Last check:'), 'no static last check');
  }
});

test('the strip gives the check time, cadence, source and links', () => {
  const s = strip(page('steam-deck'));
  assert.match(s, /<b>Checked <time class="checked-ago" datetime="2026-10-27T09:20:40.433Z" title="Tue, 27 Oct 2026 09:20:40 GMT">09:20 GMT<\/time><\/b>/);
  assert.match(s, /<span>Every 10 minutes, all 31 Steam countries<\/span>/);
  assert.match(s, /<span>Source: Steam store<\/span>/);
  assert.match(s, /<a href="\/methodology">Methodology<\/a> · <a href="https:\/\/github.com\/rfsbraz\/steamhardwarestock">Open source<\/a>/);
});

test('without a check the strip says so', () => {
  const s = strip(page('steam-deck', null));
  assert.match(s, /<b>Not checked yet<\/b>/);
  assert.ok(!s.includes('<time'));
});

test('the strip sits under the status summary, above the dock section', () => {
  const html = page('steam-dock');
  const hero = html.indexOf('<section class="hero"');
  const trust = html.indexOf('<div class="trust"');
  assert.ok(hero > 0 && trust > hero);
  assert.ok(trust < html.indexOf('id="dock-status"'));
});

test('country pages load the script that keeps the time live', () => {
  assert.ok(regionPage('steam-controller', 'US').includes(CHECKED_SCRIPT));
});

test('the script moves a time without a cell to the newer check', async () => {
  const node = { dateTime: '2026-10-27T09:20:40.433Z', textContent: 'x', title: '', getAttribute: () => null };
  const ctx = {
    document: { querySelectorAll: () => [node] },
    Date: class extends Date { static now() { return Date.parse('2026-10-27T11:05:00Z'); } },
    setInterval: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ generatedAt: '2026-10-27T11:00:40.000Z', products: {} }) })
  };
  vm.runInNewContext(CHECKED_SCRIPT.replace(/<\/?script>/g, ''), ctx);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(node.dateTime, '2026-10-27T11:00:40.000Z');
  assert.equal(node.textContent, '4 min ago');
});

test('the source line no longer reads like the last stock check', () => {
  const html = page('steam-deck');
  assert.ok(!/page on Steam<\/a>, checked/.test(html));
  assert.match(html, /These notes were last compared with Valve's page on 13 Oct 2026\. Stock is checked every 10 minutes\./);
});
