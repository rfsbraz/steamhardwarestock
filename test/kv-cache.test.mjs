import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as statusGet } from '../functions/status.json.js';
import { onRequestGet as historyGet } from '../functions/api/history.js';

// The Worker cron in cloudflare/wrangler.toml is */10 * * * *, and
// INTERVAL_SECONDS in cloudflare/worker.mjs is 600.
const CYCLE_SECONDS = 600;

function fakeKV(entries) {
  const store = new Map(Object.entries(entries));
  const reads = [];
  return {
    store,
    reads,
    async get(key) {
      reads.push(key);
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    }
  };
}

function fakeCache(now) {
  const store = new Map();
  const ttlOf = (res) => {
    const cc = res.headers.get('cache-control') || '';
    const m = /s-maxage=(\d+)/.exec(cc) || /max-age=(\d+)/.exec(cc);
    return m ? Number(m[1]) : 0;
  };
  return {
    store,
    match: async (req) => {
      const entry = store.get(req.url);
      if (!entry) return null;
      if ((now() - entry.at) / 1000 >= ttlOf(entry.res)) return null;
      return entry.res.clone();
    },
    put: async (req, res) => {
      store.set(req.url, { res, at: now() });
    }
  };
}

function stockKV() {
  return fakeKV({
    'status-body': '{"version":1,"products":{"steam-deck":{"US":{"status":"in_stock"}}}}',
    'status-meta': '{"generatedAt":"2026-11-25T12:00:00.000Z"}',
    'stock-history.json': '{"steam-deck:US":{"events":[{"ts":"2026-11-25T12:00:00.000Z","status":"in_stock"}]}}'
  });
}

async function call(handler, { kv, cache, url, headers, now = () => 0 }) {
  const waits = [];
  const res = await handler({
    request: new Request(url, headers ? { headers } : undefined),
    env: { STOCK_KV: kv },
    cache: cache || fakeCache(now),
    waitUntil: (p) => waits.push(p)
  });
  await Promise.all(waits);
  return res;
}

async function repeated(handler, url, kv, clock) {
  const cache = fakeCache(() => clock.now);
  const bodies = [];
  for (let i = 0; i < 5; i++) {
    const res = await call(handler, { kv, cache, url, now: () => clock.now });
    assert.equal(res.status, 200);
    bodies.push(await res.text());
  }
  return { cache, bodies };
}

test('repeated status.json reads in the TTL window hit KV once', async () => {
  const kv = stockKV();
  const clock = { now: 0 };
  const { bodies } = await repeated(statusGet, 'https://steamhardwarestock.com/status.json', kv, clock);
  assert.deepEqual(kv.reads, ['status-body', 'status-meta']);
  const expected = '{"generatedAt":"2026-11-25T12:00:00.000Z","version":1,"products":{"steam-deck":{"US":{"status":"in_stock"}}}}';
  assert.ok(bodies.every((b) => b === expected));
  const res = await call(statusGet, { kv, cache: fakeCache(() => 0), url: 'https://steamhardwarestock.com/status.json' });
  const sMax = Number(/s-maxage=(\d+)/.exec(res.headers.get('cache-control'))[1]);
  assert.equal(sMax, CYCLE_SECONDS);
  assert.ok(sMax <= CYCLE_SECONDS);
});

test('repeated history reads in the TTL window hit KV once', async () => {
  const kv = stockKV();
  const clock = { now: 0 };
  const { bodies } = await repeated(historyGet, 'https://steamhardwarestock.com/api/history', kv, clock);
  assert.deepEqual(kv.reads, ['stock-history.json']);
  assert.ok(bodies.every((b) => b === kv.store.get('stock-history.json')));
  const res = await call(historyGet, { kv, cache: fakeCache(() => 0), url: 'https://steamhardwarestock.com/api/history' });
  const sMax = Number(/s-maxage=(\d+)/.exec(res.headers.get('cache-control'))[1]);
  assert.equal(sMax, CYCLE_SECONDS);
  assert.ok(sMax <= CYCLE_SECONDS);
});

test('an expired TTL re-reads status.json and history from KV', async () => {
  const kv = stockKV();
  const clock = { now: 0 };
  const statusCache = fakeCache(() => clock.now);
  const historyCache = fakeCache(() => clock.now);
  await call(statusGet, { kv, cache: statusCache, url: 'https://steamhardwarestock.com/status.json' });
  await call(historyGet, { kv, cache: historyCache, url: 'https://steamhardwarestock.com/api/history' });
  assert.deepEqual(kv.reads, ['status-body', 'status-meta', 'stock-history.json']);
  clock.now = (CYCLE_SECONDS - 1) * 1000;
  await call(statusGet, { kv, cache: statusCache, url: 'https://steamhardwarestock.com/status.json' });
  await call(historyGet, { kv, cache: historyCache, url: 'https://steamhardwarestock.com/api/history' });
  assert.deepEqual(kv.reads, ['status-body', 'status-meta', 'stock-history.json']);
  clock.now = CYCLE_SECONDS * 1000;
  await call(statusGet, { kv, cache: statusCache, url: 'https://steamhardwarestock.com/status.json' });
  await call(historyGet, { kv, cache: historyCache, url: 'https://steamhardwarestock.com/api/history' });
  assert.deepEqual(kv.reads, ['status-body', 'status-meta', 'stock-history.json', 'status-body', 'status-meta', 'stock-history.json']);
});

test('a fresh KV write is visible within one stock-check cycle', async () => {
  const kv = stockKV();
  const clock = { now: 0 };
  const statusCache = fakeCache(() => clock.now);
  const historyCache = fakeCache(() => clock.now);
  const statusUrl = 'https://steamhardwarestock.com/status.json';
  const historyUrl = 'https://steamhardwarestock.com/api/history';
  const firstStatus = await call(statusGet, { kv, cache: statusCache, url: statusUrl });
  const firstHistory = await call(historyGet, { kv, cache: historyCache, url: historyUrl });
  assert.match(await firstStatus.text(), /2026-11-25T12:00:00.000Z/);
  assert.match(await firstHistory.text(), /2026-11-25T12:00:00.000Z/);

  kv.store.set('status-meta', '{"generatedAt":"2026-11-25T12:10:00.000Z"}');
  kv.store.set('status-body', '{"version":1,"products":{"steam-deck":{"US":{"status":"out_of_stock"}}}}');
  kv.store.set('stock-history.json', '{"steam-deck:US":{"events":[{"ts":"2026-11-25T12:10:00.000Z","status":"out_of_stock"}]}}');

  clock.now = CYCLE_SECONDS * 1000;
  const nextStatus = await (await call(statusGet, { kv, cache: statusCache, url: statusUrl })).text();
  const nextHistory = await (await call(historyGet, { kv, cache: historyCache, url: historyUrl })).text();
  assert.match(nextStatus, /2026-11-25T12:10:00.000Z/);
  assert.match(nextStatus, /out_of_stock/);
  assert.match(nextHistory, /2026-11-25T12:10:00.000Z/);
});

test('a no-cache request skips the edge cache and sees a fresh write immediately', async () => {
  const kv = stockKV();
  const cache = fakeCache(() => 0);
  const url = 'https://steamhardwarestock.com/status.json';
  await call(statusGet, { kv, cache, url });
  kv.store.set('status-meta', '{"generatedAt":"2026-11-25T12:10:00.000Z"}');
  kv.store.set('status-body', '{"version":1,"products":{"steam-deck":{"US":{"status":"out_of_stock"}}}}');
  const cached = await call(statusGet, { kv, cache, url });
  assert.match(await cached.text(), /2026-11-25T12:00:00.000Z/);
  const fresh = await (await call(statusGet, { kv, cache, url, headers: { 'cache-control': 'no-cache' } })).text();
  assert.match(fresh, /2026-11-25T12:10:00.000Z/);
  assert.match(fresh, /out_of_stock/);
});
