import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRegionPage } from '../lib/landing.mjs';
import { availabilityFor, AVAILABILITY } from '../lib/availability.mjs';
import { isIndexable, soldViaKomodo } from '../lib/seo.mjs';
import { PRODUCTS, REGIONS, productById, regionByCode } from '../lib/products.mjs';

const page = (id, cc) => renderRegionPage(productById(id), regionByCode(cc), {}, null, {});
const body = (html) => html.match(/<main[\s\S]*<\/main>/)[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('Valve\'s own sales notes are recorded with a source', () => {
  for (const [id, a] of Object.entries(AVAILABILITY)) {
    assert.ok(productById(id), id);
    assert.match(a.source, /^https:\/\/store\.steampowered\.com\//);
  }
  assert.deepEqual(AVAILABILITY['steam-frame'].komodo, ['JP', 'TW', 'HK']);
  assert.equal(AVAILABILITY['steam-frame'].notes.KR, 'later');
  assert.equal(AVAILABILITY['steam-machine'].notes.KR, 'not-sold');
  assert.ok(soldViaKomodo(productById('steam-machine'), 'TW'));
  assert.ok(!soldViaKomodo(productById('steam-machine'), 'KR'));
});

test('Komodo pages explain Komodo and link Valve\'s page', () => {
  const html = page('steam-frame', 'JP');
  assert.match(html, /<meta name="robots" content="index,follow/);
  assert.match(body(html), /Komodo/);
  assert.match(html, /href="https:\/\/store\.steampowered\.com\/hardware\/steamframe\/"/);
  assert.match(html, /href="https:\/\/komodostation\.com/);
});

test('South Korea gets the Frame "later" note and the Machine "not sold" note', () => {
  const frame = body(page('steam-frame', 'KR'));
  assert.match(frame, /later date/);
  assert.match(frame, /South Korea/);
  const machine = body(page('steam-machine', 'KR'));
  assert.match(machine, /will not be sold in South Korea/);
  assert.match(page('steam-machine', 'KR'), /<title>[^<]*Not Sold in South Korea/);
});

test('a page is indexable only when its text is unique to that product and country', () => {
  for (const p of PRODUCTS) {
    const seen = new Map();
    for (const r of REGIONS) {
      if (!isIndexable(p, r.code)) {
        assert.match(page(p.id, r.code), /<meta name="robots" content="noindex,follow">/, `${p.id}/${r.code}`);
        continue;
      }
      const key = body(page(p.id, r.code)).split(r.name).join('X').replace(/\b[A-Z]{2}\b/g, 'X');
      if (availabilityFor(p, r.code).kind === 'note') {
        assert.ok(!seen.has(key), `${p.id}/${r.code} reads the same as ${seen.get(key)} apart from the name`);
        seen.set(key, r.code);
      }
    }
  }
});

test('generic not-sold pages still answer where to buy, but stay noindex', () => {
  const html = page('steam-machine', 'BR');
  assert.match(html, /noindex,follow/);
  assert.match(body(html), /Steam sells it in \d+ countries/);
});
