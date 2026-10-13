import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCTS } from '../lib/products.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

test('Steam Deck includes the 256GB LCD model', () => {
  const lcd = byId['steam-deck'].packages.find((p) => p.id === 595604);
  assert.ok(lcd, 'package 595604 missing');
  assert.equal(lcd.label, '256GB LCD');
});

test('Valve certified refurbished Decks are tracked', () => {
  const refurb = byId['steam-deck-refurbished'];
  assert.ok(refurb, 'steam-deck-refurbished product missing');
  assert.deepEqual(
    refurb.packages.map((p) => [p.id, p.priceUsd]),
    [[903905, 279], [903906, 319], [903907, 359], [1202542, 629], [1202547, 759]]
  );
  assert.deepEqual(refurb.packageIds, refurb.packages.map((p) => p.id));
});

test('every catalog copy lists the same products and packages', () => {
  const app = read('public/app.js');
  const history = read('public/history.js');
  const seed = read('api/seed.mjs');
  const index = read('public/index.html');
  const vercel = read('vercel.json');
  for (const product of PRODUCTS) {
    for (const file of [['app.js', app], ['history.js', history], ['seed.mjs', seed]]) {
      assert.ok(file[1].includes(`'${product.id}'`), `${product.id} missing from ${file[0]}`);
    }
    assert.ok(index.includes(`href="/${product.id}"`), `${product.id} missing from index.html`);
    assert.ok(vercel.includes(`${product.id}|`) || vercel.includes(`|${product.id})`), `${product.id} missing from vercel.json`);
    for (const { id } of product.packages) {
      assert.ok(app.includes(`id: ${id},`), `${id} missing from app.js`);
      assert.ok(history.includes(String(id)), `${id} missing from history.js`);
    }
  }
});
