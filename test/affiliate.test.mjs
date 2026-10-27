import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Affiliate from '../public/affiliate.js';
import { renderProductPage, renderRegionPage } from '../lib/landing.mjs';
import { PRODUCTS, REGIONS } from '../lib/products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Build output goes to os.tmpdir(); remove it after the file's tests, pass or fail.
const tmpPaths = [];
after(() => { for (const p of tmpPaths) rmSync(p, { recursive: true, force: true }); });

const OFF = { jsaux: { refId: '' }, amazon: { enabled: false, tag: '' } };
const JSAUX_ON = { jsaux: { refId: 'ref123' }, amazon: { enabled: false, tag: '' } };
const ALL_ON = { jsaux: { refId: 'ref123' }, amazon: { enabled: true, tag: 'shs-20' } };
const deck = PRODUCTS.find((p) => p.id === 'steam-deck');
const us = REGIONS.find((r) => r.code === 'US');

test('committed config has empty IDs and Amazon off', () => {
  const file = JSON.parse(readFileSync(path.join(root, 'affiliate.config.json'), 'utf8'));
  const { promo, ...jsaux } = Affiliate.resolveConfig(file, {}).jsaux;
  assert.deepEqual({ ...Affiliate.resolveConfig(file, {}), jsaux }, OFF);
});

test('env overrides the config file', () => {
  const cfg = Affiliate.resolveConfig(OFF, { AFFILIATE_JSAUX_REF: ' r ', AFFILIATE_AMAZON_ENABLED: '1', AFFILIATE_AMAZON_TAG: 't-20' });
  assert.deepEqual(cfg, { jsaux: { refId: 'r' }, amazon: { enabled: true, tag: 't-20' } });
});

test('no IDs renders no block and no footer disclosure', () => {
  for (const p of PRODUCTS) assert.equal(Affiliate.accessoryBlock(p.id, OFF), '');
  assert.equal(Affiliate.footerDisclosure(OFF), '');
});

test('with a JSAUX ID every link carries the ref, rel sponsored noopener and target _blank', () => {
  const html = Affiliate.accessoryBlock('steam-deck', JSAUX_ON);
  const links = [...html.matchAll(/<a [^>]+>/g)].map((m) => m[0]);
  assert.equal(links.length, Affiliate.JSAUX['steam-deck'].length);
  for (const a of links) {
    assert.match(a, /href="https:\/\/jsaux\.com\/collections\/[a-z0-9-]+\?sca_ref=ref123"/);
    assert.match(a, /rel="sponsored noopener"/);
    assert.match(a, /target="_blank"/);
    assert.match(a, /data-affiliate="jsaux" data-product="steam-deck"/);
  }
  assert.ok(html.includes(Affiliate.DISCLOSURE));
  assert.ok(!html.includes(Affiliate.AMAZON_DISCLOSURE));
  assert.ok(!html.includes('<script'), 'no scripts in the block');
});

test('a product without JSAUX links renders nothing', () => {
  assert.equal(Affiliate.accessoryBlock('steam-frame', JSAUX_ON), '');
});

test('Amazon flag off renders no Amazon link and no Amazon disclosure', () => {
  const cfg = { jsaux: { refId: '' }, amazon: { enabled: false, tag: 'shs-20' } };
  assert.equal(Affiliate.accessoryBlock('steam-deck', cfg), '');
  assert.equal(Affiliate.footerDisclosure(cfg), '');
});

test('Amazon flag on without a tag still renders nothing', () => {
  const cfg = { jsaux: { refId: '' }, amazon: { enabled: true, tag: '' } };
  assert.equal(Affiliate.accessoryBlock('steam-deck', cfg), '');
});

test('Amazon flag on renders tagged links and the required disclosure', () => {
  const html = Affiliate.accessoryBlock('steam-deck', ALL_ON);
  assert.match(html, /href="https:\/\/www\.amazon\.com\/s\?k=[^"]+&amp;tag=shs-20" target="_blank" rel="sponsored noopener" data-affiliate="amazon"/);
  assert.ok(html.includes('As an Amazon Associate I earn from qualifying purchases.'));
  assert.ok(Affiliate.footerDisclosure(ALL_ON).includes('As an Amazon Associate I earn from qualifying purchases.'));
});

function fakeDom() {
  let handler;
  const doc = { addEventListener: (type, fn) => { assert.equal(type, 'click'); handler = fn; } };
  const link = { href: 'https://jsaux.com/x?sca_ref=r', getAttribute: (n) => ({ 'data-product': 'steam-deck', 'data-affiliate': 'jsaux' }[n]) };
  const inside = { closest: (sel) => (sel === 'a[data-affiliate]' ? link : null) };
  const outside = { closest: () => null };
  return { doc, click: (target) => handler({ target }), inside, outside };
}

test('one delegated click handler fires the GA4 event', () => {
  const dom = fakeDom();
  const calls = [];
  Affiliate.installClickTracking(dom.doc, { gtag: (...a) => calls.push(a) });
  dom.click(dom.inside);
  dom.click(dom.outside);
  assert.deepEqual(calls, [['event', 'affiliate_click', { product: 'steam-deck', partner: 'jsaux', link: 'https://jsaux.com/x?sca_ref=r', format: 'link' }]]);
});

test('click tracking does nothing when gtag is missing or throws', () => {
  const dom = fakeDom();
  Affiliate.installClickTracking(dom.doc, {});
  assert.doesNotThrow(() => dom.click(dom.inside));
  const dom2 = fakeDom();
  Affiliate.installClickTracking(dom2.doc, { gtag: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => dom2.click(dom2.inside));
});

test('landing pages render the block, footer disclosure and tracker only when IDs are set', () => {
  for (const html of [renderProductPage(deck, {}, null, { affiliate: ALL_ON }), renderRegionPage(deck, us, {}, null, { affiliate: ALL_ON })]) {
    assert.ok(html.includes('class="affiliate-block"'));
    assert.ok(html.includes('<footer') && html.slice(html.indexOf('<footer')).includes(Affiliate.AMAZON_DISCLOSURE));
    assert.ok(html.includes("'affiliate_click'"), 'inline click tracker missing');
  }
  for (const html of [renderProductPage(deck, {}, null), renderRegionPage(deck, us, {}, null, { affiliate: OFF })]) {
    assert.ok(!html.includes('affiliate'), 'nothing affiliate-related without IDs');
  }
});

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

function build(extraEnv) {
  const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-dist-'));
  tmpPaths.push(dist);
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: root,
    env: { ...process.env, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: '', AFFILIATE_JSAUX_REF: '', AFFILIATE_AMAZON_TAG: '', AFFILIATE_AMAZON_ENABLED: '', BUILD_DIST: dist, ...extraEnv },
    stdio: 'pipe'
  });
  return { dist, read: (rel) => readFileSync(path.join(dist, rel), 'utf8'), files: htmlFiles(dist) };
}

for (const cf of ['', '1']) {
  test(`build${cf ? ' with CF_PAGES=1' : ''} puts the block and disclosures in the prerendered pages`, () => {
    const out = build({ CF_PAGES: cf, AFFILIATE_JSAUX_REF: 'ref123', AFFILIATE_AMAZON_ENABLED: '1', AFFILIATE_AMAZON_TAG: 'shs-20' });
    for (const rel of ['steam-deck.html', 'steam-deck/us.html', 'steam-machine/gb.html']) {
      const html = out.read(rel);
      assert.ok(html.includes('class="affiliate-block"'), `${rel} has no block`);
      assert.ok(html.includes('sca_ref=ref123'), `${rel} has no JSAUX ref`);
      assert.ok(html.includes(Affiliate.AMAZON_DISCLOSURE), `${rel} has no Amazon disclosure`);
    }
    const index = out.read('index.html');
    assert.ok(index.includes(Affiliate.DISCLOSURE), 'homepage footer disclosure missing');
    const asset = readdirSync(out.dist).find((f) => /^affiliate\.[a-f0-9]{8}\.js$/.test(f));
    assert.ok(asset && index.includes(`/${asset}`), 'homepage does not load the hashed affiliate.js');
    assert.ok(readFileSync(path.join(out.dist, asset), 'utf8').includes('"ref123"'), 'config not baked into affiliate.js');
    if (cf) assert.match(out.read('_headers'), /\/affiliate\.\*\.js/);
  });
}

test('default build renders no affiliate links anywhere', () => {
  const out = build({});
  for (const file of out.files) {
    const html = readFileSync(file, 'utf8');
    assert.ok(!html.includes('affiliate-block') && !html.includes('sca_ref') && !html.includes('Amazon Associate'), `${path.relative(root, file)} has affiliate content`);
  }
});
