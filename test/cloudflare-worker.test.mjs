import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { runCheck } from '../cloudflare/worker.mjs';
import { onRequestGet as statusGet } from '../functions/status.json.js';
import { onRequestGet as historyGet } from '../functions/api/history.js';
import { VALVE_SELLS } from '../lib/products.mjs';

function fakeKV() {
  const store = new Map();
  const reads = [];
  const writes = [];
  return {
    store,
    reads,
    writes,
    async get(key) { reads.push(key); return store.has(key) ? store.get(key) : null; },
    async put(key, value) { writes.push(key); store.set(key, value); }
  };
}

async function served(kv) {
  const res = await statusGet({ env: { STOCK_KV: kv } });
  assert.equal(res.status, 200);
  return JSON.parse(await res.text());
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

test('cron run stores the status and history in KV with one request per region', async () => {
  const env = { STOCK_KV: fakeKV() };
  const steam = steamFetch(true);
  const out = await runCheck(env, { fetchImpl: steam.impl, now: new Date('2026-10-13T12:00:00Z') });
  assert.equal(steam.calls.length, VALVE_SELLS.length);
  const doc = await served(env.STOCK_KV);
  assert.equal(doc.generatedAt, '2026-10-13T12:00:00.000Z');
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.regions, VALVE_SELLS);
  assert.ok(doc.products['steam-deck'].US.packages.length > 0);
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
  assert.equal((await served(env.STOCK_KV)).version, 1);
});

test('Pages functions serve status.json and history from KV', async () => {
  const kv = fakeKV();
  kv.store.set('status-body', '{"version":1,"products":{}}');
  kv.store.set('status-meta', '{"generatedAt":"x"}');
  const res = await statusGet({ env: { STOCK_KV: kv } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /s-maxage=60/);
  assert.deepEqual(JSON.parse(await res.text()), { generatedAt: 'x', version: 1, products: {} });
  const empty = await historyGet({ env: { STOCK_KV: fakeKV() } });
  assert.equal(await empty.text(), '{}');
  const missing = await statusGet({ env: { STOCK_KV: fakeKV() } });
  assert.equal(missing.status, 503);
});

test('a run with no change writes only the small meta key and skips history', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl, now: new Date('2026-10-13T12:00:00Z') });
  const body = env.STOCK_KV.store.get('status-body');
  env.STOCK_KV.reads.length = 0;
  env.STOCK_KV.writes.length = 0;
  const out = await runCheck(env, { fetchImpl: steamFetch(true).impl, now: new Date('2026-10-13T12:10:00Z') });
  assert.equal(out.transitions, 0);
  assert.deepEqual(env.STOCK_KV.reads.sort(), ['status-meta', 'steam-raw'], 'only the small keys and the raw answers are read');
  assert.deepEqual(env.STOCK_KV.writes, ['status-meta']);
  assert.equal(env.STOCK_KV.store.get('status-body'), body);
  assert.equal((await served(env.STOCK_KV)).generatedAt, '2026-10-13T12:10:00.000Z');
});

test('a status change rewrites the body and history', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  env.STOCK_KV.writes.length = 0;
  const out = await runCheck(env, { fetchImpl: steamFetch(false).impl });
  assert.ok(out.transitions > 0);
  assert.deepEqual([...env.STOCK_KV.writes].sort(), ['status-body', 'status-meta', 'steam-raw', 'stock-history.json']);
  assert.equal((await served(env.STOCK_KV)).products['steam-deck'].US.status, 'out_of_stock');
});

test('the first run after the migration does the full check with legacy keys present', async () => {
  const env = { STOCK_KV: fakeKV() };
  env.STOCK_KV.store.set('status.json', '{"generatedAt":"old","version":1,"products":{}}');
  env.STOCK_KV.store.set('stock-history.json', '{}');
  assert.equal((await served(env.STOCK_KV)).generatedAt, 'old', 'Pages falls back to the legacy key');
  const out = await runCheck(env, { fetchImpl: steamFetch(true).impl, now: new Date('2026-10-13T12:00:00Z') });
  assert.ok(out.transitions > 0);
  assert.ok(env.STOCK_KV.reads.includes('stock-history.json'));
  assert.equal((await served(env.STOCK_KV)).generatedAt, '2026-10-13T12:00:00.000Z');
});

test('served status.json matches the document the checker builds', async () => {
  const { buildStatusDoc } = await import('../lib/status-doc.mjs');
  const { checkAll } = await import('../lib/steam.mjs');
  const env = { STOCK_KV: fakeKV() };
  const now = new Date('2026-10-13T12:00:00Z');
  await runCheck(env, { fetchImpl: steamFetch(true).impl, now });
  const { results } = await checkAll({ fetchImpl: steamFetch(true).impl });
  assert.deepEqual(await served(env.STOCK_KV), buildStatusDoc(results, { generatedAt: now.toISOString(), intervalSeconds: 600 }));
});

test('identical Steam answers skip parsing and building the document', async () => {
  const steam = await import('../lib/steam.mjs');
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  let parsed = 0;
  const original = JSON.parse;
  JSON.parse = (text, ...rest) => { if (String(text).startsWith('{"response"')) parsed++; return original(text, ...rest); };
  try {
    await runCheck(env, { fetchImpl: steamFetch(true).impl });
  } finally {
    JSON.parse = original;
  }
  assert.equal(parsed, 0, 'no Steam answer is parsed');
  assert.equal(typeof steam.classifyAnswers, 'function');
});

test('a changed detail that keeps the status rewrites the body but not history', async () => {
  const env = { STOCK_KV: fakeKV() };
  const fetchWith = (days) => async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const details = input.packageid.map((packageid) => ({ packageid, inventory_available: true, allow_purchase_in_country: true, estimated_delivery_soonest_business_days: days }));
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
  await runCheck(env, { fetchImpl: fetchWith(2) });
  const history = env.STOCK_KV.store.get('stock-history.json');
  env.STOCK_KV.writes.length = 0;
  const out = await runCheck(env, { fetchImpl: fetchWith(3) });
  assert.equal(out.transitions, 0);
  assert.ok(env.STOCK_KV.writes.includes('status-body'));
  assert.ok(!env.STOCK_KV.writes.includes('stock-history.json'));
  assert.equal(env.STOCK_KV.store.get('stock-history.json'), history);
  assert.equal((await served(env.STOCK_KV)).products['steam-deck'].US.packages[0].details.estimated_delivery_soonest_business_days, 3);
});

test('a failed region never counts as unchanged', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  const ok = steamFetch(true).impl;
  const flaky = async (url) => (url.includes('%22US%22') ? new Response('', { status: 500 }) : ok(url));
  env.STOCK_KV.writes.length = 0;
  const out = await runCheck(env, { fetchImpl: flaky });
  assert.equal(out.errors > 0, true);
  assert.ok(!('US' in (await served(env.STOCK_KV)).products['steam-deck']), 'the failed region is left out, as before');
  env.STOCK_KV.writes.length = 0;
  await runCheck(env, { fetchImpl: ok });
  assert.ok(env.STOCK_KV.writes.includes('status-body'), 'recovers on the next good run');
});
