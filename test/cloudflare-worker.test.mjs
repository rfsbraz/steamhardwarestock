import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

function withDispatch(dispatches, status = 204) {
  return (steam) => async (url, init) => {
    if (String(url).startsWith('https://api.github.com/')) {
      dispatches.push({ url: String(url), init });
      return new Response(null, { status });
    }
    return steam(url, init);
  };
}

test('a status change dispatches the Pages deploy workflow on GitHub', async () => {
  const dispatches = [];
  const env = { STOCK_KV: fakeKV(), GH_DISPATCH_TOKEN: 'tok' };
  await runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(true).impl), now: new Date('2026-10-13T12:00:00Z') });
  assert.equal(dispatches.length, 1);
  const { url, init } = dispatches[0];
  assert.equal(url, 'https://api.github.com/repos/rfsbraz/steamhardwarestock/actions/workflows/pages-deploy.yml/dispatches');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, 'Bearer tok');
  assert.equal(init.headers.accept, 'application/vnd.github+json');
  assert.ok(init.headers['user-agent'], 'GitHub requires a User-Agent');
  assert.deepEqual(JSON.parse(init.body), { ref: 'main' });
});

test('dispatches are debounced to one per 10 minutes', async () => {
  const dispatches = [];
  const env = { STOCK_KV: fakeKV(), GH_DISPATCH_TOKEN: 'tok' };
  const run = (inStock, iso) => runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(inStock).impl), now: new Date(iso) });
  await run(true, '2026-10-13T12:00:00Z');
  await run(false, '2026-10-13T12:05:00Z');
  await run(true, '2026-10-13T12:09:59Z');
  assert.equal(dispatches.length, 1);
  await run(false, '2026-10-13T12:10:00Z');
  assert.equal(dispatches.length, 2);
});

test('no change means no dispatch', async () => {
  const dispatches = [];
  const env = { STOCK_KV: fakeKV(), GH_DISPATCH_TOKEN: 'tok' };
  await runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(true).impl), now: new Date('2026-10-13T12:00:00Z') });
  await runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(true).impl), now: new Date('2026-10-13T13:00:00Z') });
  assert.equal(dispatches.length, 1);
});

test('a missing GH_DISPATCH_TOKEN skips the dispatch quietly', async () => {
  const dispatches = [];
  const env = { STOCK_KV: fakeKV() };
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a);
  try {
    const out = await runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(true).impl) });
    assert.ok(out.transitions > 0);
  } finally {
    console.error = original;
  }
  assert.equal(dispatches.length, 0);
  assert.deepEqual(errors, []);
  assert.equal(env.STOCK_KV.store.has('dispatch-last'), false);
});

test('a failed dispatch is retried on the next change, not debounced', async () => {
  const dispatches = [];
  const env = { STOCK_KV: fakeKV(), GH_DISPATCH_TOKEN: 'tok' };
  const original = console.error;
  console.error = () => {};
  try {
    await runCheck(env, { fetchImpl: withDispatch(dispatches, 403)(steamFetch(true).impl), now: new Date('2026-10-13T12:00:00Z') });
    await runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(false).impl), now: new Date('2026-10-13T12:01:00Z') });
  } finally {
    console.error = original;
  }
  assert.equal(dispatches.length, 2);
});

test('both wrangler.toml files bind the real STOCK_KV namespace', () => {
  for (const file of ['wrangler.toml', 'cloudflare/wrangler.toml']) {
    const toml = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(toml, /binding = "STOCK_KV"\nid = "ef31e7789d0949b987f9814a86ed0fce"/, file);
    assert.ok(!toml.includes('PAGES_DEPLOY_HOOK'), file);
  }
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
