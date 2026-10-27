import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as landing from '../lib/landing.mjs';
import { PRODUCTS } from '../lib/products.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const page = (id) => landing.renderProductPage(byId[id], fx.history, fx.status, { prices: fx.prices });
const box = (html) => html.match(/<section class="alert-box"[\s\S]*?<\/section>/)?.[0] || '';

// Reads the attributes of the rendered RSS link, so the click goes through
// the same markup the page ships.
function rssLink(html) {
  const tag = box(html).match(/<a [^>]*href="\/rss\.xml"[^>]*>/)?.[0] || '';
  const attrs = Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  return { getAttribute: (n) => (n in attrs ? attrs[n] : null), matches: (sel) => sel === 'a[data-alert]' && 'data-alert' in attrs };
}

function setup(gtag) {
  let handler;
  const doc = { addEventListener: (type, fn) => { assert.equal(type, 'click'); handler = fn; } };
  landing.installAlertTracking(doc, { gtag });
  const click = (link) => handler({ target: { closest: (sel) => (link && link.matches(sel) ? link : null) } });
  return click;
}

test('clicking the RSS link in the alert box sends alert_subscribe with the product and channel', () => {
  for (const id of ['steam-deck', 'steam-dock']) {
    const calls = [];
    const click = setup((...a) => calls.push(a));
    click(rssLink(page(id)));
    assert.deepEqual(calls, [['event', 'alert_subscribe', { product: id, channel: 'rss' }]]);
  }
});

test('other clicks do not send alert_subscribe', () => {
  const calls = [];
  const click = setup((...a) => calls.push(a));
  click(null);
  const affiliate = { getAttribute: (n) => ({ 'data-affiliate': 'jsaux', 'data-product': 'steam-deck' }[n] ?? null), matches: () => false };
  click(affiliate);
  assert.deepEqual(calls, []);
});

test('alert tracking does nothing when gtag is missing or throws', () => {
  const link = rssLink(page('steam-deck'));
  assert.doesNotThrow(() => setup(undefined)(link));
  assert.doesNotThrow(() => setup(() => { throw new Error('blocked'); })(link));
});

test('product pages inline the alert tracker', () => {
  const html = page('steam-deck');
  assert.ok(html.includes("'alert_subscribe'"), 'inline alert tracker missing');
});
