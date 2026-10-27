import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEAL_PICKS } from '../lib/jsaux-feed.mjs';
import { tmpDir } from './helpers/tmp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = ['steam-deck.html', 'steam-deck/us.html', 'steam-dock.html', 'steam-controller.html'];

function build(extraEnv) {
  const dist = tmpDir('shs-dist-');
  const fixture = path.join(dist, '..', `${path.basename(dist)}-data.json`);
  writeFileSync(fixture, JSON.stringify({ status: null, history: {}, prices: {} }));
  execFileSync(process.execPath, ['--import', path.join(root, 'test/fixtures/jsaux-fetch.mjs'), 'scripts/build.js'], {
    cwd: root,
    env: { ...process.env, PRERENDER_OFFLINE: '', PRERENDER_FIXTURE: fixture, PRERENDER_SOURCE_URL: '', CF_PAGES: '', AFFILIATE_JSAUX_REF: '', AFFILIATE_AMAZON_TAG: '', AFFILIATE_AMAZON_ENABLED: '', BUILD_DIST: dist, JSAUX_STUB: '', ...extraEnv },
    stdio: 'pipe'
  });
  return (rel) => readFileSync(path.join(dist, rel), 'utf8');
}

// "/go/jsaux-x https://jsaux.com/products/x?sca_ref=r 302" -> { '/go/jsaux-x': ['https://...', '302'] }
const rules = (text) => Object.fromEntries(text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
  const [from, ...rest] = l.trim().split(/\s+/);
  return [from, rest];
}));

test('every card on a built page links to a /go/ path with a 302 to its JSAUX product and the ref', () => {
  const read = build({ AFFILIATE_JSAUX_REF: 'ref123' });
  const cards = [];
  for (const rel of PAGES) {
    for (const [, href, handle] of read(rel).matchAll(/<a href="([^"]+)"[^>]*data-format="card" data-item="([^"]+)"/g)) {
      assert.equal(href, `/go/jsaux-${handle}`, `${rel} card for ${handle} does not use /go/`);
      cards.push(handle);
    }
  }
  assert.ok(cards.length >= 8, `only ${cards.length} cards found`);
  const table = rules(read('_redirects'));
  for (const handle of cards) {
    assert.deepEqual(table[`/go/jsaux-${handle}`], [`https://jsaux.com/products/${handle}?sca_ref=ref123`, '302'], `no rule for ${handle}`);
  }
});

test('the redirect file covers every picked handle, even ones not shown today', () => {
  const table = rules(build({ AFFILIATE_JSAUX_REF: 'ref123' })('_redirects'));
  for (const handle of new Set(Object.values(DEAL_PICKS).flat())) {
    assert.deepEqual(table[`/go/jsaux-${handle}`], [`https://jsaux.com/products/${handle}?sca_ref=ref123`, '302']);
  }
});

test('without a JSAUX ref the /go/ paths still redirect, just without sca_ref', () => {
  const table = rules(build({})('_redirects'));
  for (const handle of new Set(Object.values(DEAL_PICKS).flat())) {
    assert.deepEqual(table[`/go/jsaux-${handle}`], [`https://jsaux.com/products/${handle}`, '302']);
  }
});
