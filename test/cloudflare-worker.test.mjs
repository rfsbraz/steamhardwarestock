import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { runCheck, quietPlan, ROTATE_PER_RUN } from '../cloudflare/worker.mjs';
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
  assert.deepEqual(JSON.parse(init.body), { ref: 'main', inputs: { checked_at: '2026-10-13T12:00:00.000Z' } });
});

test('a product going from no data to data dispatches a rebuild for that check', async () => {
  const dispatches = [];
  const env = { STOCK_KV: fakeKV(), GH_DISPATCH_TOKEN: 'tok' };
  const run = (iso) => runCheck(env, { fetchImpl: withDispatch(dispatches)(steamFetch(true).impl), now: new Date(iso) });
  await run('2026-10-27T07:50:00Z');
  // The state before the Valve Index was added: no history for it, and the
  // previous code's fingerprints. Its packages change the Steam answers, so
  // the old answer groups no longer match.
  const history = JSON.parse(env.STOCK_KV.store.get('stock-history.json'));
  for (const key of Object.keys(history)) if (key.startsWith('valve-index:')) delete history[key];
  env.STOCK_KV.store.set('stock-history.json', JSON.stringify(history));
  const meta = JSON.parse(env.STOCK_KV.store.get('status-meta'));
  env.STOCK_KV.store.set('status-meta', JSON.stringify({ ...meta, states: 'before the Valve Index', groups: undefined }));

  const out = await run('2026-10-27T08:00:40Z');
  assert.ok(out.transitions > 0);
  assert.equal(dispatches.length, 2);
  assert.deepEqual(JSON.parse(dispatches[1].init.body), { ref: 'main', inputs: { checked_at: '2026-10-27T08:00:40.000Z' } });
  assert.equal((await served(env.STOCK_KV)).generatedAt, '2026-10-27T08:00:40.000Z');
});

test('the Pages deploy workflow takes the check time and hands it to the build', () => {
  const yml = readFileSync(new URL('../.github/workflows/pages-deploy.yml', import.meta.url), 'utf8');
  assert.match(yml, /workflow_dispatch:\n\s+inputs:\n\s+checked_at:\n/);
  assert.match(yml, /PRERENDER_MIN_GENERATED_AT: \$\{\{ inputs\.checked_at \}\}/);
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
  assert.deepEqual(env.STOCK_KV.reads, ['status-meta'], 'only the small meta key is read');
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
  assert.deepEqual([...env.STOCK_KV.writes].sort(), ['status-body', 'status-meta', 'stock-history.json']);
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

// Steam answers that differ in bytes but not in anything the site uses:
// an extra field Steam adds per request and a different key order.
function noisyFetch({ inStock = true, nonce = 0 } = {}) {
  return async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const details = input.packageid.map((packageid) => (nonce % 2
      ? { notificaton_token: `#t${nonce}`, high_pending_orders: false, requires_reservation: false, allow_purchase_in_country: true, inventory_available: inStock, packageid }
      : { packageid, inventory_available: inStock, allow_purchase_in_country: true, requires_reservation: false, high_pending_orders: false, notificaton_token: `#t${nonce}` }));
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
}

function countHistoryParses(fn) {
  return async () => {
    let n = 0;
    const original = JSON.parse;
    JSON.parse = (text, ...rest) => { if (typeof text === 'string' && text.startsWith('{"steam-')) n++; return original(text, ...rest); };
    try { await fn(); } finally { JSON.parse = original; }
    return n;
  };
}

test('different bytes with the same fingerprint write no body and parse no history', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: noisyFetch({ nonce: 0 }) });
  const body = env.STOCK_KV.store.get('status-body');
  for (let nonce = 1; nonce <= 3; nonce++) {
    env.STOCK_KV.reads.length = 0;
    env.STOCK_KV.writes.length = 0;
    const parses = await countHistoryParses(() => runCheck(env, { fetchImpl: noisyFetch({ nonce }) }))();
    assert.equal(parses, 0, 'history is not parsed');
    assert.deepEqual(env.STOCK_KV.writes, ['status-meta'], 'only the meta key is written');
    assert.deepEqual(env.STOCK_KV.reads, ['status-meta'], 'neither the body nor the history is read');
  }
  assert.equal(env.STOCK_KV.store.get('status-body'), body);
});

test('identical answers parse no history and read no large key', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  env.STOCK_KV.reads.length = 0;
  const parses = await countHistoryParses(() => runCheck(env, { fetchImpl: steamFetch(true).impl }))();
  assert.equal(parses, 0);
  assert.deepEqual(env.STOCK_KV.reads, ['status-meta']);
});

test('the meta key stays small and still serves generatedAt', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl, now: new Date('2026-10-13T12:00:00Z') });
  const meta = env.STOCK_KV.store.get('status-meta');
  assert.ok(meta.length < 1024, `meta is ${meta.length} bytes`);
  assert.equal(JSON.parse(meta).generatedAt, '2026-10-13T12:00:00.000Z');
});

test('new status rules rebuild the body even when Steam answers the same', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  const meta = JSON.parse(env.STOCK_KV.store.get('status-meta'));
  env.STOCK_KV.store.set('status-meta', JSON.stringify({ ...meta, rules: meta.rules - 1 }));
  env.STOCK_KV.store.set('status-body', '{"version":1,"products":{}}');
  env.STOCK_KV.writes.length = 0;
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  assert.ok(env.STOCK_KV.writes.includes('status-body'));
  assert.ok((await served(env.STOCK_KV)).products['steam-deck'].US);
});

test('meta written by the previous Worker version leads to one full run', async () => {
  const env = { STOCK_KV: fakeKV() };
  env.STOCK_KV.store.set('status-meta', '{"generatedAt":"2026-10-14T08:30:16.189Z"}');
  env.STOCK_KV.store.set('steam-raw', 'old');
  env.STOCK_KV.store.set('stock-history.json', '{}');
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  assert.ok(env.STOCK_KV.writes.includes('status-body'));
  env.STOCK_KV.writes.length = 0;
  await runCheck(env, { fetchImpl: steamFetch(true).impl });
  assert.deepEqual(env.STOCK_KV.writes, ['status-meta']);
});

// Answers that differ by region group, like production: one answer for the
// US, one for the EU and so on.
function groupedFetch(overrides = {}) {
  const calls = [];
  const impl = async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const cc = input.context.country_code;
    calls.push(cc);
    const group = ['US', 'CA'].includes(cc) ? 'na' : ['GB', 'IE'].includes(cc) ? 'uk' : cc === 'AU' ? 'au' : 'eu';
    const inStock = overrides[cc] ?? true;
    const details = input.packageid.map((packageid) => ({ packageid, inventory_available: inStock, allow_purchase_in_country: true, estimated_delivery_soonest_business_days: group.length }));
    return new Response(JSON.stringify({ response: { details }, group }), { status: 200 });
  };
  return { impl, calls };
}

test('a quiet run fetches one region per answer group plus a few in rotation', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: groupedFetch().impl });
  const steam = groupedFetch();
  env.STOCK_KV.writes.length = 0;
  const out = await runCheck(env, { fetchImpl: steam.impl });
  assert.equal(out.unchanged, true);
  assert.equal(steam.calls.length, 4 + ROTATE_PER_RUN, 'four groups, plus the rotation');
  assert.deepEqual(env.STOCK_KV.writes, ['status-meta']);
});

test('every region is still fetched within a bounded number of quiet runs', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: groupedFetch().impl });
  const seen = new Set();
  const runs = Math.ceil(VALVE_SELLS.length / ROTATE_PER_RUN);
  for (let i = 0; i < runs; i++) {
    const steam = groupedFetch();
    await runCheck(env, { fetchImpl: steam.impl });
    steam.calls.forEach((c) => seen.add(c));
  }
  assert.deepEqual([...seen].sort(), [...VALVE_SELLS].sort());
});

test('a change in a region that is not a group leader is caught by the rotation', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: groupedFetch().impl });
  let caught = false;
  for (let i = 0; i < Math.ceil(VALVE_SELLS.length / ROTATE_PER_RUN) && !caught; i++) {
    const out = await runCheck(env, { fetchImpl: groupedFetch({ PT: false }).impl });
    caught = out.transitions > 0;
  }
  assert.ok(caught, 'PT going out of stock was recorded');
  assert.equal((await served(env.STOCK_KV)).products['steam-deck'].PT.status, 'out_of_stock');
});

test('a change in a group leader triggers a full check at once', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: groupedFetch().impl });
  const steam = groupedFetch({ US: false });
  const out = await runCheck(env, { fetchImpl: steam.impl });
  assert.ok(out.transitions > 0);
  assert.equal(new Set(steam.calls).size, VALVE_SELLS.length, 'every region was fetched');
});

test('quietPlan rotates through the regions that are not leaders', () => {
  const groups = [{ h: 'a', regions: ['US', 'CA'] }, { h: 'b', regions: ['DE', 'FR', 'IT', 'ES'] }];
  const all = ['US', 'CA', 'DE', 'FR', 'IT', 'ES'];
  const first = quietPlan(groups, 0, all);
  assert.deepEqual(first.regions.slice(0, 2), ['US', 'DE']);
  const second = quietPlan(groups, first.next, all);
  assert.equal(new Set([...first.regions, ...second.regions]).size, all.length);
});
