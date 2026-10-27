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
  const handlers = {};
  const doc = { addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); } };
  landing.installAlertTracking(doc, { gtag });
  const fire = (type, target) => (handlers[type] || []).forEach((fn) => fn({ type, target }));
  const click = (link) => fire('click', { closest: (sel) => (link && link.matches(sel) ? link : null) });
  click.fire = fire;
  return click;
}

// The alert box form as rendered, and its submit button inside it.
function alertForm(html) {
  const tag = box(html).match(/<form [^>]*>/)?.[0] || '';
  const attrs = Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const form = { getAttribute: (n) => (n in attrs ? attrs[n] : null) };
  form.closest = (sel) => (sel === 'form[data-alert]' && 'data-alert' in attrs ? form : null);
  const button = { closest: (sel) => (sel.startsWith('form') ? form.closest(sel) : null) };
  return { form, button };
}

// A button press: the click on the button, then the submit it triggers.
function pressAlertButton(click, html) {
  const { form, button } = alertForm(html);
  click.fire('click', button);
  click.fire('submit', form);
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

test('pressing the alert box button sends alert_subscribe with the product and the tab channel', () => {
  for (const id of ['steam-deck', 'steam-dock', 'steam-controller']) {
    const calls = [];
    const click = setup((...a) => calls.push(a));
    pressAlertButton(click, page(id));
    assert.deepEqual(calls, [['event', 'alert_subscribe', { product: id, channel: 'tab' }]], id);
  }
});

test('the RSS link still sends rss and each action sends exactly one event', () => {
  const calls = [];
  const click = setup((...a) => calls.push(a));
  const html = page('steam-deck');
  click(rssLink(html));
  pressAlertButton(click, html);
  assert.deepEqual(calls, [
    ['event', 'alert_subscribe', { product: 'steam-deck', channel: 'rss' }],
    ['event', 'alert_subscribe', { product: 'steam-deck', channel: 'tab' }]
  ]);
});

test('the button press does nothing when gtag is missing or throws', () => {
  const html = page('steam-deck');
  assert.doesNotThrow(() => pressAlertButton(setup(undefined), html));
  let tries = 0;
  assert.doesNotThrow(() => pressAlertButton(setup(() => { tries += 1; throw new Error('blocked'); }), html));
  assert.equal(tries, 1, 'gtag is called once and its error is swallowed');
});
