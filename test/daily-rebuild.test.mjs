import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contentHash } from '../scripts/indexnow.mjs';

const workflow = readFileSync(new URL('../.github/workflows/pages-deploy.yml', import.meta.url), 'utf8');

const strip = (price, day) => `<aside class="deal-strip" aria-label="Accessory deals"><ul class="deal-list"><li>$${price}</li></ul><p class="deal-foot">Prices from jsaux.com in USD, checked ${day}.</p></aside>`;
const page = (aside, body = 'In stock') => `<html><body><main><p>${body}</p>${aside}</main></body></html>`;

test('the Pages deploy also runs once a day so JSAUX prices stay fresh', () => {
  const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\nconcurrency:'));
  assert.match(on, /\n  schedule:\n    - cron: '\d+ \d+ \* \* \*'/);
  assert.match(on, /workflow_dispatch:/);
  assert.match(on, /push:/);
});

test('daily price changes in the deal strip do not count as a page change for IndexNow', () => {
  const base = contentHash(page(strip('29.99', '27 Oct 2026')));
  assert.equal(contentHash(page(strip('24.99', '28 Oct 2026'))), base);
  assert.equal(contentHash(page('')), base);
  assert.notEqual(contentHash(page(strip('29.99', '27 Oct 2026'), 'Out of stock')), base);
});
