import { test } from 'node:test';
import assert from 'node:assert/strict';
import Affiliate from '../public/affiliate.js';

const deal = (handle, price, was) => ({ handle, title: handle, url: `https://jsaux.com/products/${handle}`, price, was, image: `/deals/${handle}.webp` });
const CARDS = {
  jsaux: { refId: 'ref123' },
  amazon: { enabled: true, tag: 'shs-20' },
  deals: { checkedAt: '2026-10-27T06:00:00.000Z', pages: { 'steam-deck': [deal('steam-deck-docking-station', 2999, 3999), deal('bad', 0, null), deal('steam-deck-screen-protector-1', 1099, 1299)] } }
};

function clickOn(attrs, href) {
  let handler;
  const calls = [];
  const doc = { addEventListener: (_t, fn) => { handler = fn; } };
  const link = { href, getAttribute: (n) => (n in attrs ? attrs[n] : null) };
  Affiliate.installClickTracking(doc, { gtag: (...a) => calls.push(a) });
  handler({ target: { closest: () => link } });
  return calls;
}

test('each card link carries its product handle and its 1-based position among the shown cards', () => {
  const html = Affiliate.accessoryBlock('steam-deck', CARDS);
  const cards = [...html.matchAll(/<a [^>]*data-format="card"[^>]*>/g)].map((m) => m[0]);
  assert.equal(cards.length, 2);
  assert.match(cards[0], /data-item="steam-deck-docking-station" data-position="1"/);
  assert.match(cards[1], /data-item="steam-deck-screen-protector-1" data-position="2"/);
});

test('a card click sends the handle, position and card format with the usual fields', () => {
  const calls = clickOn({ 'data-product': 'steam-deck', 'data-affiliate': 'jsaux', 'data-format': 'card', 'data-item': 'steam-deck-docking-station', 'data-position': '1' }, 'https://jsaux.com/products/steam-deck-docking-station?sca_ref=r');
  assert.deepEqual(calls, [['event', 'affiliate_click', { product: 'steam-deck', partner: 'jsaux', link: 'https://jsaux.com/products/steam-deck-docking-station?sca_ref=r', format: 'card', item: 'steam-deck-docking-station', position: 1 }]]);
});

test('a text link click is sent with the link format, so it can be compared with the cards', () => {
  const calls = clickOn({ 'data-product': 'steam-deck', 'data-affiliate': 'jsaux' }, 'https://jsaux.com/collections/x?sca_ref=r');
  assert.deepEqual(calls, [['event', 'affiliate_click', { product: 'steam-deck', partner: 'jsaux', link: 'https://jsaux.com/collections/x?sca_ref=r', format: 'link' }]]);
});
