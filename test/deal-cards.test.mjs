import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Affiliate from '../public/affiliate.js';
import { renderProductPage, renderRegionPage, renderInfoPage, INFO_PAGES } from '../lib/landing.mjs';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';

const deal = (handle, title, price, was) => ({ handle, title, url: `https://jsaux.com/products/${handle}`, price, was, image: `/deals/${handle}.webp` });
const DEALS = {
  checkedAt: '2026-10-27T06:00:00.000Z',
  pages: {
    'steam-deck': [
      deal('steam-deck-docking-station', '5-in-1 Docking Station', 2999, 3999),
      deal('steam-deck-screen-protector-1', 'Screen Protector for Steam Deck LCD & OLED', 1099, 1299)
    ],
    'steam-controller': [deal('travel-carrying-case-for-steam-controller', 'Travel Carrying Case for Steam Controller', 2599, null)]
  }
};
const CARDS = { jsaux: { refId: 'ref123' }, amazon: { enabled: false, tag: '' }, deals: DEALS };
const deck = PRODUCTS.find((p) => p.id === 'steam-deck');
const us = REGIONS.find((r) => r.code === 'US');
const anchors = (html) => [...html.matchAll(/<a [^>]+>/g)].map((m) => m[0]);

test('the strip shows one card per deal with image, name, price, old price, badge and button', () => {
  const html = Affiliate.accessoryBlock('steam-deck', CARDS);
  assert.match(html, /<aside class="deal-strip"/);
  assert.equal((html.match(/<li class="deal-card">/g) || []).length, 2);
  assert.ok(html.includes('<img src="/deals/steam-deck-docking-station.webp" alt="" width="160" height="160" loading="lazy"'));
  assert.ok(html.includes('<span class="deal-name">5-in-1 Docking Station</span>'));
  assert.ok(html.includes('<strong>$29.99</strong> <s>$39.99</s>'));
  assert.ok(html.includes('<span class="deal-badge">-25%</span>'));
  assert.ok(html.includes('<span class="deal-badge">-15%</span>'));
  assert.equal((html.match(/<span class="deal-cta">Shop at JSAUX<\/span>/g) || []).length, 2);
  assert.ok(html.includes('Screen Protector for Steam Deck LCD &amp; OLED'), 'titles are escaped');
  assert.match(html, /Steam Deck accessories on sale/);
});

test('card links go to the product with the ref and stay sponsored', () => {
  const links = anchors(Affiliate.accessoryBlock('steam-deck', CARDS)).filter((a) => a.includes('jsaux.com'));
  assert.equal(links.length, 2);
  for (const a of links) {
    assert.match(a, /href="https:\/\/jsaux\.com\/products\/[a-z0-9-]+\?sca_ref=ref123"/);
    assert.match(a, /target="_blank" rel="sponsored noopener" data-affiliate="jsaux" data-product="steam-deck"/);
  }
});

test('a small Ad tag carries the disclosure, and the footer names the source, date and disclosures page', () => {
  const html = Affiliate.accessoryBlock('steam-deck', CARDS);
  assert.ok(html.includes(`<span class="deal-ad" title="${Affiliate.DISCLOSURE}">Ad</span>`));
  assert.ok(!html.includes('affiliate-disclosure'), 'no long disclosure line in the strip');
  assert.ok(html.includes('<p class="deal-foot">Prices from jsaux.com in USD, checked 27 Oct 2026. <a href="/disclosures">Affiliate links</a></p>'));
});

test('no sale means no badge, no struck price and no "on sale" title', () => {
  const html = Affiliate.accessoryBlock('steam-controller', CARDS);
  assert.ok(html.includes('<strong>$25.99</strong></span>'));
  assert.ok(!html.includes('deal-badge') && !html.includes('<s>'));
  assert.match(html, /<span class="deal-title">Steam Controller accessories<\/span>/);
});

test('pages without deals, or a build without the feed, keep the text links', () => {
  assert.match(Affiliate.accessoryBlock('steam-machine', CARDS), /class="affiliate-block"/);
  const noFeed = Affiliate.accessoryBlock('steam-deck', { ...CARDS, deals: undefined });
  assert.match(noFeed, /class="affiliate-block"/);
  assert.ok(!noFeed.includes('deal-strip'));
});

test('no JSAUX ref shows no cards even if deals were baked', () => {
  assert.equal(Affiliate.accessoryBlock('steam-deck', { ...CARDS, jsaux: { refId: '' } }), '');
});

test('Amazon links still show under the cards with their own disclosure', () => {
  const html = Affiliate.accessoryBlock('steam-deck', { ...CARDS, amazon: { enabled: true, tag: 'shs-20' } });
  assert.match(html, /deal-strip[\s\S]*class="affiliate-block"/);
  assert.ok(html.includes(Affiliate.AMAZON_DISCLOSURE));
  assert.ok(!/affiliate-links">[^]*jsaux\.com/.test(html), 'JSAUX text links are replaced by the cards');
});

test('deals pointing off jsaux.com or at a remote image are dropped', () => {
  const bad = { ...CARDS, deals: { ...DEALS, pages: { 'steam-deck': [
    { ...DEALS.pages['steam-deck'][0], url: 'https://evil.example/x' },
    { ...DEALS.pages['steam-deck'][1], image: 'https://cdn.shopify.com/x.png' }
  ] } } };
  const html = Affiliate.accessoryBlock('steam-deck', bad);
  assert.ok(!html.includes('deal-strip'));
  assert.match(html, /class="affiliate-block"/, 'falls back to the text links');
});

test('landing pages render the strip and the click tracker', () => {
  for (const html of [renderProductPage(deck, {}, null, { affiliate: CARDS }), renderRegionPage(deck, us, {}, null, { affiliate: CARDS })]) {
    assert.ok(html.includes('class="deal-strip"'));
    assert.ok(html.includes("'affiliate_click'"));
  }
});

test('Disclosures explains the cards, the Ad tag and where prices come from', () => {
  const page = INFO_PAGES.find((p) => p.path === '/disclosures');
  const html = renderInfoPage(page, { affiliate: { jsaux: { refId: 'x' }, amazon: { enabled: false, tag: '' } } });
  assert.match(html, /marked Ad/);
  assert.match(html, /prices? (come|comes) from jsaux\.com/i);
});

test('styles cover the strip, with sideways scrolling when it gets narrow', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  for (const sel of ['.deal-strip', '.deal-card', '.deal-badge', '.deal-ad', '.deal-foot']) assert.ok(css.includes(sel), sel);
  assert.match(css, /@container[^{]*\{\s*\.deal-list\s*\{[^}]*overflow-x:\s*auto/);
});

test('the Steam Deck Dock strip is titled for docks only', () => {
  const dock = deal('upgraded-docking-station-for-steam-deck', '6-in-1 Docking Station', 3999, 4999);
  const html = Affiliate.accessoryBlock('steam-dock', { ...CARDS, deals: { checkedAt: DEALS.checkedAt, pages: { 'steam-dock': [dock] } } });
  assert.match(html, /<span class="deal-title">Steam Deck docks on sale<\/span>/);
});
