import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { runCheck } from '../cloudflare/worker.mjs';
import { onRequestGet as statusGet } from '../functions/status.json.js';
import { onRequestGet as historyGet } from '../functions/api/history.js';
import { VALVE_SELLS } from '../lib/products.mjs';

function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value) { store.set(key, value); }
  };
}

function steamFetch(inStock) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const details = input.packageid.map((packageid) => ({
      packageid,
      inventory_available: inStock,
      allow_purchase_in_country: true,
      requires_reservation: false,
      high_pending_orders: false
    }));
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
  return { impl, calls };
}

test('cron run writes status.json and history to KV with one request per region', async () => {
  const env = { STOCK_KV: fakeKV() };
  const steam = steamFetch(true);
  const out = await runCheck(env, { fetchImpl: steam.impl, now: new Date('2026-10-13T12:00:00Z') });
  assert.equal(steam.calls.length, VALVE_SELLS.length);
  const doc = JSON.parse(env.STOCK_KV.store.get('status.json'));
  assert.equal(doc.generatedAt, '2026-10-13T12:00:00.000Z');
  const history = JSON.parse(env.STOCK_KV.store.get('stock-history.json'));
  assert.ok(Object.keys(history).length > 0);
  assert.equal(out.transitions, Object.keys(history).length);
});

test('a second run with no change does not rewrite history', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  const before = env.STOCK_KV.store.get('stock-history.json');
  const out = await runCheck(env, { fetchImpl: steamFetch(true).impl });
  assert.equal(out.transitions, 0);
  assert.equal(env.STOCK_KV.store.get('stock-history.json'), before);
});

test('pings the Pages deploy hook on a change, at most once per hour', async () => {
  const pings = [];
  const env = { STOCK_KV: fakeKV(), PAGES_DEPLOY_HOOK: 'https://hook.example/x' };
  const wrap = (steam) => async (url, init) => {
    if (String(url).startsWith('https://hook.example')) { pings.push(init?.method); return new Response('{}'); }
    return steam(url, init);
  };
  await runCheck(env, { fetchImpl: wrap(steamFetch(true).impl), now: new Date('2026-10-13T12:00:00Z') });
  await runCheck(env, { fetchImpl: wrap(steamFetch(false).impl), now: new Date('2026-10-13T12:10:00Z') });
  await runCheck(env, { fetchImpl: wrap(steamFetch(true).impl), now: new Date('2026-10-13T13:20:00Z') });
  assert.deepEqual(pings, ['POST', 'POST']);
});

test('scheduled handler runs the check inside waitUntil', async () => {
  const env = { STOCK_KV: fakeKV() };
  const waited = [];
  const original = globalThis.fetch;
  globalThis.fetch = steamFetch(true).impl;
  try {
    worker.scheduled({}, env, { waitUntil: (p) => waited.push(p) });
    await Promise.all(waited);
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(env.STOCK_KV.store.has('status.json'));
});

test('Pages functions serve status.json and history from KV', async () => {
  const kv = fakeKV();
  kv.store.set('status.json', '{"generatedAt":"x"}');
  const res = await statusGet({ env: { STOCK_KV: kv } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /s-maxage=60/);
  assert.equal(await res.text(), '{"generatedAt":"x"}');
  const empty = await historyGet({ env: { STOCK_KV: fakeKV() } });
  assert.equal(await empty.text(), '{}');
  const missing = await statusGet({ env: { STOCK_KV: fakeKV() } });
  assert.equal(missing.status, 503);
});
