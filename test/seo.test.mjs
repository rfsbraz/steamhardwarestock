import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, REGIONS, VALVE_SELLS } from '../lib/products.mjs';
import { isIndexable } from '../lib/seo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://steamhardwarestock.com';

// A fixture close to real data: every Valve region checked, a few in stock,
// history for some keys, and prices for the US, Germany and Poland only.
function fixture() {
  const products = {};
  for (const p of PRODUCTS) {
    products[p.id] = {};
    for (const cc of VALVE_SELLS) {
      const status = p.id === 'steam-deck' && cc === 'US' ? 'in_stock' : p.id === 'steam-frame' ? 'waitlist' : 'out_of_stock';
      products[p.id][cc] = {
        status,
        packages: p.packages.map((pk) => ({ id: pk.id, status, details: { estimated_delivery_soonest_business_days: 3, estimated_delivery_latest_business_days: 5 } }))
      };
    }
  }
  const status = { version: 1, generatedAt: '2026-10-13T12:00:00.000Z', intervalSeconds: 600, regions: VALVE_SELLS, products };
  const history = {
    'steam-deck:US': { productId: 'steam-deck', region: 'US', lastInStock: '2026-10-12T08:00:00.000Z', events: [{ ts: '2026-10-12T08:00:00.000Z', available: true, status: 'in_stock' }, { ts: '2026-10-01T10:00:00.000Z', available: false, status: 'out_of_stock' }] },
    'steam-deck:DE': { productId: 'steam-deck', region: 'DE', lastInStock: '2026-09-20T09:30:00.000Z', lastOutOfStock: '2026-09-21T09:30:00.000Z', events: [{ ts: '2026-09-21T09:30:00.000Z', available: false, status: 'out_of_stock' }, { ts: '2026-09-20T09:30:00.000Z', available: true, status: 'in_stock' }] },
    'steam-dock:GB': { productId: 'steam-dock', region: 'GB', lastOutOfStock: '2026-08-05T07:00:00.000Z', events: [{ ts: '2026-08-05T07:00:00.000Z', available: false, status: 'out_of_stock' }] }
  };
  const prices = {
    946113: { US: { amount: 789, currency: 'USD', formatted: '$789.00' }, DE: { amount: 779, currency: 'EUR', formatted: '779,00€' }, PL: { amount: 3279, currency: 'PLN', formatted: '3 279,00 zł' } },
    946114: { US: { amount: 949, currency: 'USD', formatted: '$949.00' } },
    761892: { GB: { amount: 69, currency: 'GBP', formatted: '£69.00' } }
  };
  return { status, history, prices };
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const builds = new Map();
function build(cf) {
  if (builds.has(cf)) return builds.get(cf);
  const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-seo-'));
  const fixturePath = path.join(dist, '..', `${path.basename(dist)}-fixture.json`);
  writeFileSync(fixturePath, JSON.stringify(fixture()));
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, BUILD_DIST: dist, PRERENDER_FIXTURE: fixturePath, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf },
    stdio: 'pipe'
  });
  const pages = htmlFiles(dist).map((file) => {
    const html = readFileSync(file, 'utf8');
    const rel = '/' + path.relative(dist, file).replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '');
    const meta = (re) => (html.match(re) || [])[1];
    return {
      rel: rel === '/' ? '/' : rel.replace(/\/$/, ''),
      html,
      title: meta(/<title>([^<]*)<\/title>/),
      description: meta(/<meta name="description" content="([^"]*)"/),
      canonical: meta(/<link rel="canonical" href="([^"]*)"/),
      ogUrl: meta(/<meta property="og:url" content="([^"]*)"/),
      robots: meta(/<meta name="robots" content="([^"]*)"/),
      ld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat())
    };
  });
  const out = { dist, pages, read: (rel) => readFileSync(path.join(dist, rel), 'utf8') };
  builds.set(cf, out);
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

for (const cf of ['', '1']) {
  const label = cf ? ' (CF_PAGES=1)' : '';

  test(`every page has an apex canonical and og:url that match its path${label}`, () => {
    const { pages } = build(cf);
    assert.ok(pages.length > 300);
    for (const p of pages) {
      // The 404 page is served at any unknown path, so it has no URL of its own.
      if (p.rel === '/404') {
        assert.equal(p.canonical, undefined);
        assert.equal(p.ogUrl, undefined);
        assert.match(p.robots, /^noindex/);
        continue;
      }
      assert.equal(p.canonical, `${SITE}${p.rel}`, p.rel);
      assert.equal(p.ogUrl, p.canonical, p.rel);
    }
  });

  test(`no www or http URLs pointing at the site anywhere in the output${label}`, () => {
    const { pages, read } = build(cf);
    const files = [...pages.map((p) => p.html), read('sitemap.xml'), read('robots.txt')];
    for (const text of files) {
      assert.doesNotMatch(text, /www\.steamhardwarestock\.com/);
      assert.doesNotMatch(text, /http:\/\/steamhardwarestock\.com/);
    }
  });

  test(`titles and descriptions are unique and within length limits${label}`, () => {
    const { pages } = build(cf);
    const titles = new Map();
    const descriptions = new Map();
    for (const p of pages) {
      const t = decode(p.title);
      const d = decode(p.description);
      assert.ok(t.length >= 20 && t.length <= 60, `${p.rel} title is ${t.length} chars: ${t}`);
      assert.ok(d.length >= 70 && d.length <= 160, `${p.rel} description is ${d.length} chars: ${d}`);
      assert.ok(!titles.has(t), `${p.rel} repeats the title of ${titles.get(t)}`);
      assert.ok(!descriptions.has(d), `${p.rel} repeats the description of ${descriptions.get(d)}`);
      titles.set(t, p.rel);
      descriptions.set(d, p.rel);
      assert.ok(!/\u2014/.test(t + d), `${p.rel} uses an em dash`);
    }
  });

  test(`product titles target the search terms people use${label}`, () => {
    const { pages } = build(cf);
    const title = (rel) => decode(pages.find((p) => p.rel === rel).title).toLowerCase();
    assert.match(title('/'), /steam hardware tracker/);
    assert.match(title('/steam-frame'), /availability/);
    assert.match(title('/steam-machine'), /availab/);
    assert.match(title('/steam-deck'), /restock/);
    assert.match(title('/steam-dock'), /restock|out of stock/);
    assert.match(title('/steam-controller'), /tracker/);
    assert.match(title('/steam-deck/de'), /germany/);
  });

  test(`Product JSON-LD offers always carry price, currency, availability and url${label}`, () => {
    const { pages } = build(cf);
    let offers = 0;
    for (const p of pages) {
      for (const item of p.ld) {
        assert.equal(item['@context'], 'https://schema.org', p.rel);
        if (item['@type'] !== 'Product') continue;
        assert.ok(item.name && item.image && item.brand?.name, `${p.rel} Product is missing name, image or brand`);
        const list = [item.offers].flat();
        assert.ok(list.length > 0, `${p.rel} has a Product with no offers`);
        for (const o of list) {
          offers++;
          assert.equal(o['@type'], 'Offer');
          assert.equal(typeof o.price, 'number', `${p.rel} offer without a numeric price`);
          assert.ok(o.price > 0);
          assert.match(o.priceCurrency, /^[A-Z]{3}$/);
          assert.match(o.availability, /^https:\/\/schema\.org\/(InStock|OutOfStock|PreOrder|BackOrder)$/);
          assert.match(o.url, /^https:\/\/store\.steampowered\.com\//);
        }
      }
    }
    assert.ok(offers > 0, 'no offers at all');
    const deck = pages.find((p) => p.rel === '/steam-deck').ld.find((i) => i['@type'] === 'Product');
    const us = [deck.offers].flat().find((o) => o.priceCurrency === 'USD' && o.price === 789);
    assert.equal(us.availability, 'https://schema.org/InStock');
    const de = pages.find((p) => p.rel === '/steam-deck/de').ld.find((i) => i['@type'] === 'Product');
    assert.deepEqual([de.offers].flat().map((o) => [o.price, o.priceCurrency]), [[779, 'EUR']]);
  });

  test(`pages with no known price output no Product at all${label}`, () => {
    const { pages } = build(cf);
    for (const rel of ['/steam-frame', '/steam-frame/fr', '/steam-deck/fr', '/steam-deck/no']) {
      const p = pages.find((x) => x.rel === rel);
      assert.ok(!p.ld.some((i) => i['@type'] === 'Product'), `${rel} has a Product without prices`);
      assert.ok(p.ld.some((i) => i['@type'] === 'BreadcrumbList'), `${rel} lost its breadcrumbs`);
    }
  });

  test(`country pages differ in real content, not only the name${label}`, () => {
    const { pages } = build(cf);
    const body = (rel) => pages.find((p) => p.rel === rel).html
      .replace(/<head>[\s\S]*?<\/head>/, '')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    const de = body('/steam-deck/de');
    const fr = body('/steam-deck/fr');
    assert.match(de, /779,00€/);
    assert.match(de, /Germany/);
    assert.ok(!fr.includes('779,00€'));
    assert.match(de, /20 Sep 2026/, 'recorded restock missing');
    assert.match(body('/steam-deck/us'), /3 to 5 business days/);
    const other = (text) => text.replace(/Germany|France|DE|FR/g, 'X');
    assert.notEqual(other(de), other(fr));
  });

  test(`countries Valve does not sell in are noindex and left out of the sitemap${label}`, () => {
    const { pages, read } = build(cf);
    const sitemap = read('sitemap.xml');
    for (const p of PRODUCTS) {
      for (const r of REGIONS) {
        const rel = `/${p.id}/${r.code.toLowerCase()}`;
        const page = pages.find((x) => x.rel === rel);
        const listed = sitemap.includes(`<loc>${SITE}${rel}</loc>`);
        if (isIndexable(p, r.code)) {
          assert.match(page.robots, /^index,follow/, rel);
          assert.ok(listed, `${rel} missing from sitemap`);
        } else {
          assert.match(page.robots, /^noindex,follow/, rel);
          assert.ok(!listed, `${rel} should not be in the sitemap`);
        }
      }
    }
    const byId = (id) => PRODUCTS.find((p) => p.id === id);
    assert.ok(isIndexable(byId('steam-deck'), 'JP'), 'Komodo sells the Deck in Japan');
    assert.ok(isIndexable(byId('steam-frame'), 'JP'), 'Valve lists Komodo for the Frame in Japan');
    assert.ok(isIndexable(byId('steam-frame'), 'KR'), 'Frame in Korea has its own Valve note');
    assert.ok(isIndexable(byId('steam-machine'), 'KR'), 'Machine in Korea has its own Valve note');
    assert.ok(!isIndexable(byId('steam-frame'), 'BR'), 'generic not-sold pages stay noindex');
  });

  test(`sitemap is valid, apex only, and lastmod comes from the data${label}`, () => {
    const { read, pages } = build(cf);
    const xml = read('sitemap.xml');
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ loc: m[1], lastmod: m[2] }));
    assert.ok(urls.length > 100);
    assert.equal(new Set(urls.map((u) => u.loc)).size, urls.length, 'duplicate loc');
    for (const u of urls) {
      assert.ok(u.loc.startsWith(`${SITE}/`), u.loc);
      const rel = u.loc.slice(SITE.length) || '/';
      assert.ok(pages.some((p) => p.rel === rel), `${u.loc} has no built page`);
      if (u.lastmod) assert.match(u.lastmod, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    }
    const lm = (rel) => urls.find((u) => u.loc === `${SITE}${rel}`)?.lastmod;
    assert.equal(lm('/steam-deck/us'), '2026-10-12T08:00:00.000Z');
    assert.equal(lm('/steam-deck/de'), '2026-09-21T09:30:00.000Z');
    assert.equal(lm('/steam-deck'), '2026-10-12T08:00:00.000Z');
    assert.equal(lm('/steam-dock'), '2026-08-05T07:00:00.000Z');
    assert.equal(lm('/'), '2026-10-12T08:00:00.000Z');
    assert.equal(lm('/steam-frame/fr'), undefined, 'no data means no lastmod, not the build time');
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(!urls.some((u) => u.lastmod?.startsWith(today)), 'lastmod must not be the build date');
    assert.match(read('robots.txt'), /^Sitemap: https:\/\/steamhardwarestock\.com\/sitemap\.xml$/m);
  });

  test(`the Steam Deck page has a factual restock section${label}`, () => {
    const { pages } = build(cf);
    const html = pages.find((p) => p.rel === '/steam-deck').html;
    const section = (html.match(/<section[^>]*id="restock"[\s\S]*?<\/section>/) || [])[0];
    assert.ok(section, 'restock section missing');
    assert.match(section, /Steam Deck restock/i);
    assert.match(section, /United States/);
    assert.match(section, /12 Oct 2026/);
    assert.match(section, /Germany/);
    assert.doesNotMatch(section, /expected|rumou?r|will restock on|next restock date/i);
  });

  test(`landing links open the live tracker with the parameters app.js reads${label}`, () => {
    const { pages } = build(cf);
    const html = pages.find((p) => p.rel === '/steam-deck/de').html;
    assert.match(html, /href="\/\?p=steam-deck&amp;r=DE"/);
    assert.doesNotMatch(html, /\?product=/);
  });
}

test('CF_PAGES=1 build still writes _headers', () => {
  const { read } = build('1');
  assert.match(read('_headers'), /\/sw\.js/);
});
