#!/usr/bin/env node
// Measures the Worker's CPU time and KV writes per run, without Cloudflare.
// Steam responses are recorded once (--capture), then replayed, so the time
// measured is our own work (JSON parsing, status rules, KV documents) and
// not network waits, which Workers do not bill as CPU.
//
//   node scripts/measure-worker.mjs --capture            # record live Steam answers to /tmp
//   node scripts/measure-worker.mjs [--regions all] [--runs 50]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runCheck, STATUS_BODY_KEY, HISTORY_KEY } from '../cloudflare/worker.mjs';
import { REGIONS, VALVE_SELLS } from '../lib/products.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const regions = opt('regions', 'valve') === 'all' ? REGIONS.map((r) => r.code) : VALVE_SELLS;
const runs = Number(opt('runs', 50));
const file = `/tmp/shs-steam-${regions.length}.json`;

const regionOf = (url) => JSON.parse(new URL(url).searchParams.get('input_json')).context.country_code;

if (args.includes('--capture')) {
  const saved = {};
  for (const cc of regions) {
    const { regionUrl } = await import('../lib/steam.mjs');
    const { PRODUCTS, isCheckable } = await import('../lib/products.mjs');
    const ids = [...new Set(PRODUCTS.filter(isCheckable).flatMap((p) => p.packageIds))];
    saved[cc] = await (await fetch(regionUrl(cc, ids))).text();
  }
  writeFileSync(file, JSON.stringify(saved));
  console.log(`saved ${regions.length} regions to ${file}`);
  process.exit(0);
}
if (!existsSync(file)) { console.error(`run with --capture${regions.length > VALVE_SELLS.length ? ' --regions all' : ''} first`); process.exit(1); }
const saved = JSON.parse(readFileSync(file, 'utf8'));

function kv() {
  const store = new Map();
  let writes = 0;
  return { store, writes: () => writes, async get(k) { return store.get(k) ?? null; }, async put(k, v) { writes++; store.set(k, v); } };
}
const fetchImpl = async (url) => new Response(saved[regionOf(url)], { status: 200 });

const env = { STOCK_KV: kv() };
const print = console.log;
console.log = () => {};
const times = [];
let fetches = 0;
for (let i = 0; i < runs + 5; i++) {
  const before = env.STOCK_KV.writes();
  const start = process.cpuUsage();
  const out = await runCheckWith(env);
  const used = process.cpuUsage(start);
  if (i >= 5) times.push((used.user + used.system) / 1000);
  if (i === runs + 4) fetches = out.fetchCount;
  if (i === 0) print(`KV writes on the first run (seeds history): ${env.STOCK_KV.writes() - before}`);
  if (i === 5) print(`KV writes on a run with no changes: ${env.STOCK_KV.writes() - before}`);
}
async function runCheckWith(e) {
  let count = 0;
  const f = async (url) => { count++; return fetchImpl(url); };
  const r = await runCheck(e, { fetchImpl: f, regions });
  return { ...r, fetchCount: count };
}
times.sort((a, b) => a - b);
const p = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(2);
print(`regions: ${regions.length}, subrequests per run: ${fetches}`);
print(`CPU per run (ms): median ${p(0.5)}, p90 ${p(0.9)}, max ${times[times.length - 1].toFixed(2)} over ${runs} runs`);
print(`status body ${env.STOCK_KV.store.get(STATUS_BODY_KEY)?.length || 0} bytes, history ${env.STOCK_KV.store.get(HISTORY_KEY)?.length || 0} bytes`);
