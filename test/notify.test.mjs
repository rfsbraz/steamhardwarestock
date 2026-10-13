import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../cloudflare/worker.mjs';
import { notifyChanges, formatMessage, DISCORD_MAX } from '../lib/notify.mjs';

const HOOK = 'https://discord.com/api/webhooks/123/secret-token';
const TOPIC = 'shs-secret-topic';

function fakeKV() {
  const store = new Map();
  return { store, async get(k) { return store.has(k) ? store.get(k) : null; }, async put(k, v) { store.set(k, v); } };
}
function steam(inStock) {
  return async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    const details = input.packageid.map((packageid) => ({ packageid, inventory_available: inStock, allow_purchase_in_country: true, requires_reservation: false, high_pending_orders: false }));
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
}
function router(inStock, { hookStatus = 204, throwOn } = {}) {
  const posts = [];
  const impl = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://discord.com/') || u.startsWith('https://ntfy.sh/')) {
      posts.push({ url: u, init });
      if (throwOn && u.startsWith(throwOn)) throw new Error(`connect failed ${u}`);
      return new Response(null, { status: hookStatus });
    }
    return steam(inStock)(url);
  };
  return { impl, posts };
}
function captureConsole() {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.join(' '));
  return { lines, restore: () => Object.assign(console, orig) };
}
const changes = (n) => Array.from({ length: n }, (_, i) => ({ productName: 'Steam Deck', regionName: `Country ${i}`, url: `https://steamhardwarestock.com/steam-deck/c${i}`, status: 'in_stock', previous: 'out_of_stock' }));

test('the first run seeds history without posting anything', async () => {
  const env = { STOCK_KV: fakeKV(), DISCORD_WEBHOOK_URL: HOOK, NTFY_TOPIC: TOPIC };
  const r = router(true);
  await runCheck(env, { fetchImpl: r.impl });
  assert.equal(r.posts.length, 0);
});

test('a burst of changes in one run becomes one Discord post and one ntfy post', async () => {
  const env = { STOCK_KV: fakeKV(), DISCORD_WEBHOOK_URL: HOOK, NTFY_TOPIC: TOPIC };
  await runCheck(env, { fetchImpl: router(false).impl });
  const r = router(true);
  const out = await runCheck(env, { fetchImpl: r.impl });
  assert.ok(out.transitions > 5);
  assert.equal(r.posts.filter((p) => p.url === HOOK).length, 1);
  assert.equal(r.posts.filter((p) => p.url === `https://ntfy.sh/${TOPIC}`).length, 1);
  const body = JSON.parse(r.posts.find((p) => p.url === HOOK).init.body);
  assert.ok(body.content.length <= DISCORD_MAX);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.match(body.content, /Out of stock → In stock|In stock/);
  assert.equal(out.notified, true);
});

test('missing secrets skip quietly', async () => {
  const env = { STOCK_KV: fakeKV() };
  await runCheck(env, { fetchImpl: router(false).impl });
  const r = router(true);
  const c = captureConsole();
  try { await runCheck(env, { fetchImpl: r.impl }); } finally { c.restore(); }
  assert.equal(r.posts.length, 0);
  assert.ok(!c.lines.some((l) => /discord|ntfy/i.test(l)));
});

test('only one channel set posts only there', async () => {
  const r = router(true);
  await notifyChanges({ NTFY_TOPIC: TOPIC }, changes(2), { fetchImpl: r.impl });
  assert.deepEqual(r.posts.map((p) => p.url), [`https://ntfy.sh/${TOPIC}`]);
  const h = r.posts[0].init.headers;
  assert.ok(h.Title || h.title);
});

test('failures never break the cron and never log the URL or topic', async () => {
  for (const opts of [{ hookStatus: 500 }, { throwOn: 'https://discord.com/' }, { throwOn: 'https://ntfy.sh/' }]) {
    const env = { STOCK_KV: fakeKV(), DISCORD_WEBHOOK_URL: HOOK, NTFY_TOPIC: TOPIC };
    await runCheck(env, { fetchImpl: router(false).impl });
    const c = captureConsole();
    let out;
    try { out = await runCheck(env, { fetchImpl: router(true, opts).impl }); } finally { c.restore(); }
    assert.ok(out.transitions > 0, 'history still written');
    assert.ok(env.STOCK_KV.store.get('stock-history.json').includes('in_stock'));
    const text = c.lines.join('\n');
    assert.ok(!text.includes('secret-token') && !text.includes(TOPIC) && !text.includes('webhooks/123'), text);
  }
});

test('long bursts are cut with a count of the rest', () => {
  const msg = formatMessage(changes(200));
  assert.ok(msg.length <= DISCORD_MAX);
  assert.match(msg, /and \d+ more/);
  assert.match(formatMessage(changes(1)), /Steam Deck in Country 0: Out of stock → In stock/);
});
