import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProductPage, renderRegionPage } from '../lib/landing.mjs';
import { prerenderHome } from '../scripts/prerender.mjs';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';

// Trimmed from the live status.json and history of 27 Oct 2026.
const fx = JSON.parse(readFileSync(new URL('./fixtures/live-2026-10-27.json', import.meta.url)));
const product = (id) => PRODUCTS.find((p) => p.id === id);
const region = (cc) => REGIONS.find((r) => r.code === cc);
const homeSource = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

const attrsOf = (tag) => Object.fromEntries([...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const text = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

// A stand-in for the browser DOM, built from the page as it ships: every
// .pcards list with its cards, the deal-strip links, the country select and
// the <html> element.
function pageDom(html, { select = null, countries = null } = {}) {
  const lists = [...html.matchAll(/<div class="pcards">([\s\S]*?)<\/div>/g)].map((m) => {
    const list = { cards: [] };
    list.querySelectorAll = (sel) => (sel === 'a.pcard' ? list.cards : []);
    for (const [, tag, inner] of m[1].matchAll(/<a ([^>]*class="pcard"[^>]*)>([\s\S]*?)<\/a>/g)) {
      const a = attrsOf(tag);
      const card = { getAttribute: (n) => (n in a ? a[n] : null) };
      card.querySelector = (sel) => (sel === '.nm' ? { textContent: text(inner.match(/<span class="nm">([^<]*)<\/span>/)[1]) } : null);
      card.closest = (sel) => (sel === 'a.pcard' ? card : sel === '.pcards' ? list : null);
      list.cards.push(card);
    }
    return list;
  });
  const deals = [...html.matchAll(/<a ([^>]*data-affiliate="[^"]*"[^>]*)>/g)].map((m) => {
    const a = attrsOf(m[1]);
    const link = { href: a.href, getAttribute: (n) => (n in a ? a[n] : null) };
    link.closest = (sel) => (sel === 'a[data-affiliate]' ? link : null);
    return link;
  });
  const handlers = [];
  const doc = {
    addEventListener: (type, fn) => { if (type === 'click') handlers.push(fn); },
    querySelector: (sel) => (sel === 'select[data-country]' && select !== null ? { value: select } : null),
    documentElement: { getAttribute: (n) => (n === 'data-countries' ? countries : null) }
  };
  return { doc, lists, deals, click: (target) => handlers.forEach((fn) => fn({ target })) };
}

// Runs the page's own inline click trackers against the stand-in DOM.
function load(html, path, opts) {
  const dom = pageDom(html, opts);
  const calls = [];
  const win = { gtag: (...a) => calls.push(a), location: { pathname: path } };
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    if (code.includes('product_card_click') || code.includes('affiliate_click')) new Function('document', 'window', code)(dom.doc, win);
  }
  return { ...dom, calls };
}

const event = (product, product_name, position, page, country) =>
  ['event', 'product_card_click', { product, product_name, position, page, country, transport_type: 'beacon' }];

test('every homepage card sends product_card_click with its product, name, place, page and the picked countries', () => {
  const page = load(prerenderHome(homeSource, fx.status, fx.history), '/', { countries: 'PT,US' });
  const cards = page.lists[0].cards;
  assert.equal(cards.length, PRODUCTS.length);
  cards.forEach((c) => page.click(c));
  assert.deepEqual(page.calls, PRODUCTS.map((p, i) => event(p.id, p.name, i + 1, '/', 'PT,US')));
});

test('a related card on a product page sends the country picked in the page select', () => {
  const page = load(renderProductPage(product('steam-deck'), fx.history, fx.status, {}), '/steam-deck', { select: 'PT' });
  const [related] = page.lists;
  page.click(related.cards[0]);
  page.click(related.cards[3]);
  assert.deepEqual(page.calls, [
    event('steam-dock', 'Steam Deck Dock', 1, '/steam-deck', 'PT'),
    event('steam-deck-black-friday', 'Steam Deck Black Friday', 4, '/steam-deck', 'PT')
  ]);
});

test('with no country picked yet the country is empty', () => {
  const page = load(renderProductPage(product('steam-frame'), fx.history, fx.status, {}), '/steam-frame', { select: '' });
  page.click(page.lists[0].cards[0]);
  assert.deepEqual(page.calls, [event('steam-frame-ergonomic-kit', 'Steam Frame Ergonomic Accessories Kit', 1, '/steam-frame', '')]);
});

test('a card on a country page sends that country', () => {
  const page = load(renderRegionPage(product('steam-deck'), region('DE'), fx.history, fx.status, {}), '/steam-deck/de');
  const cards = page.lists[0].cards;
  page.click(cards[1]);
  assert.deepEqual(page.calls, [event(cards[1].getAttribute('href').split('/')[1], cards[1].querySelector('.nm').textContent, 2, '/steam-deck/de', 'DE')]);
});

test('clicks outside a card and pages without gtag send nothing and do not throw', () => {
  const page = load(prerenderHome(homeSource, fx.status, fx.history), '/');
  page.click({ closest: () => null });
  page.click(null);
  assert.deepEqual(page.calls, []);
  const bare = pageDom(prerenderHome(homeSource, fx.status, fx.history));
  for (const [, code] of prerenderHome(homeSource, fx.status, fx.history).matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    if (code.includes('product_card_click')) new Function('document', 'window', code)(bare.doc, { location: { pathname: '/' } });
  }
  assert.doesNotThrow(() => bare.click(bare.lists[0].cards[0]));
});

test('a JSAUX deal card still sends only affiliate_click, unchanged', () => {
  const deal = { handle: 'steam-deck-docking-station', title: 'Dock', url: 'https://jsaux.com/products/steam-deck-docking-station', price: 2999, was: 3999, image: '/deals/d.webp' };
  const affiliate = { jsaux: { refId: 'ref123' }, amazon: { enabled: false, tag: '' }, deals: { checkedAt: '2026-10-27T06:00:00.000Z', pages: { 'steam-deck': [deal] } } };
  const page = load(renderProductPage(product('steam-deck'), fx.history, fx.status, { affiliate }), '/steam-deck', { select: 'PT' });
  const card = page.deals.find((l) => l.getAttribute('data-format') === 'card');
  page.click(card);
  assert.deepEqual(page.calls, [['event', 'affiliate_click', { product: 'steam-deck', partner: 'jsaux', link: card.href, format: 'card', item: 'steam-deck-docking-station', position: 1 }]]);
});
