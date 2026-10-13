import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildStatusDoc, STATUS_FIELDS } from '../lib/status-doc.mjs';
import { PRODUCTS, VALVE_SELLS, isCheckable } from '../lib/products.mjs';
import { checkAll } from '../lib/steam.mjs';
import proxy from '../api/proxy.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/hardware-items.json', import.meta.url)));

function fakeFetch() {
  return async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const details = input.packageid.map((packageid) => ({ ...fx['frame-us-waitlist'], packageid, extra_field: 'drop me' }));
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
}

test('status doc covers every checkable product in every Valve region', async () => {
  const { results } = await checkAll({ fetchImpl: fakeFetch() });
  const doc = buildStatusDoc(results, { generatedAt: '2026-10-13T12:00:00.000Z', intervalSeconds: 600 });
  assert.equal(doc.version, 1);
  assert.equal(doc.generatedAt, '2026-10-13T12:00:00.000Z');
  assert.equal(doc.intervalSeconds, 600);
  assert.deepEqual(doc.regions, VALVE_SELLS);
  for (const p of PRODUCTS.filter(isCheckable)) {
    for (const region of VALVE_SELLS) {
      const cell = doc.products[p.id][region];
      assert.equal(cell.status, 'waitlist');
      assert.equal(cell.packages.length, p.packageIds.length);
    }
  }
});

test('status doc keeps only the fields the site uses', async () => {
  const { results } = await checkAll({ fetchImpl: fakeFetch(), regions: ['US'] });
  const doc = buildStatusDoc(results, { generatedAt: 'now', intervalSeconds: 600 });
  const d = doc.products['steam-frame'].US.packages[0].details;
  assert.ok(!('extra_field' in d));
  for (const key of Object.keys(d)) assert.ok(STATUS_FIELDS.includes(key), key);
});

test('the browser no longer posts to /api/record and polls /status.json', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const history = readFileSync(new URL('../public/history.js', import.meta.url), 'utf8');
  assert.ok(!app.includes('/api/record') && !history.includes('/api/record'));
  assert.ok(app.includes('/status.json'));
  assert.ok(!existsSync(new URL('../api/record.mjs', import.meta.url)), 'the cron is the only writer');
});

test('the proxy only serves Komodo Station now', async () => {
  const steam = 'https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/?input_json=%7B%7D';
  const res = await proxy(new Request(`https://x/proxy?url=${encodeURIComponent(steam)}`));
  assert.equal(res.status, 403);
});
