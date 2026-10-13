#!/usr/bin/env node
// Local CPU benchmark for the cron Worker. Network waits are not billed as CPU
// on Workers, so Steam is replayed from a capture and KV is an in-memory map
// seeded with real-sized copies of the production values.
//
//   node scripts/bench-worker.mjs --capture   # save Steam answers and the
//                                             # public /status.json and
//                                             # /api/history (read-only)
//   node scripts/bench-worker.mjs [--worker path/to/worker.mjs] [--runs 40] [--cold-change]
//
// The cold run starts from KV as a previous run left it: the script first runs
// the check once in a child process and saves the KV map, so the timed cold
// run is a normal steady-state run in a fresh process, not a migration run.
//
// Each run is timed with process.cpuUsage around runCheck only. "cold" is the
// first run in a fresh process, which is closest to a new Worker isolate.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dir = opt('dir', '/tmp/shs-bench');
const runs = Number(opt('runs', 40));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const workerPath = path.resolve(opt('worker', path.join(root, 'cloudflare/worker.mjs')));
const regionOf = (url) => JSON.parse(new URL(url).searchParams.get('input_json')).context.country_code;

if (args.includes('--capture')) {
  mkdirSync(dir, { recursive: true });
  const { regionUrl } = await import('../lib/steam.mjs');
  const { PRODUCTS, VALVE_SELLS, isCheckable } = await import('../lib/products.mjs');
  const ids = [...new Set(PRODUCTS.filter(isCheckable).flatMap((p) => p.packageIds))];
  const steam = {};
  for (const cc of VALVE_SELLS) steam[cc] = await (await fetch(regionUrl(cc, ids))).text();
  writeFileSync(path.join(dir, 'steam.json'), JSON.stringify(steam));
  for (const [file, url] of [['status.json', 'https://steamhardwarestock.com/status.json'], ['history.json', 'https://steamhardwarestock.com/api/history']]) {
    writeFileSync(path.join(dir, file), await (await fetch(url)).text());
  }
  console.log(`saved Steam answers for ${VALVE_SELLS.length} regions, status.json and history to ${dir}`);
  process.exit(0);
}
if (!existsSync(path.join(dir, 'steam.json'))) { console.error('run with --capture first'); process.exit(1); }

const steam = JSON.parse(readFileSync(path.join(dir, 'steam.json'), 'utf8'));
const seed = {
  'status.json': readFileSync(path.join(dir, 'status.json'), 'utf8'),
  'stock-history.json': readFileSync(path.join(dir, 'history.json'), 'utf8')
};
// A second set of answers where the US stops selling everything, to time a
// run with a real status change.
const flipped = JSON.parse(JSON.stringify(steam));
{
  const us = JSON.parse(flipped.US);
  for (const d of us.response.details) d.allow_purchase_in_country = false;
  flipped.US = JSON.stringify(us);
}

const statePath = path.join(dir, `state-${Buffer.from(workerPath).toString('hex').slice(-24)}.json`);
const priming = args.includes('--prime');
if (!priming) {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [new URL(import.meta.url).pathname, '--prime', '--worker', workerPath, '--dir', dir]);
}
const start = priming ? seed : JSON.parse(readFileSync(statePath, 'utf8'));
const kv = { store: new Map(Object.entries(start)), writes: 0, writeBytes: 0 };
const env = {
  STOCK_KV: {
    async get(k) { return kv.store.get(k) ?? null; },
    async put(k, v) { kv.writes++; kv.writeBytes += v.length; kv.store.set(k, v); }
  }
};
// Map each request URL to its answer up front, so the timed part does not
// pay for decoding the URL. Workers still parses the JSON, so that stays in.
const { regionUrl } = await import('../lib/steam.mjs');
const { PRODUCTS, isCheckable } = await import('../lib/products.mjs');
const ids = [...new Set(PRODUCTS.filter(isCheckable).flatMap((p) => p.packageIds))];
const byUrl = (answers) => new Map(Object.entries(answers).map(([cc, text]) => [regionUrl(cc, ids), text]));
const replay = (answers) => {
  const map = byUrl(answers);
  return async (url) => {
    const text = map.get(String(url)) ?? answers[regionOf(url)];
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
  };
};

// Node loads some built-ins lazily on first use (WebCrypto, AbortController,
// TextEncoder). Workers has them ready, so touch them before timing.
await crypto.subtle.digest('SHA-1', new TextEncoder().encode('warm'));
clearTimeout(setTimeout(() => {}, 1));
new AbortController().abort();
JSON.parse(JSON.stringify({ warm: [1, 'a', true] }));
new URL('https://example.com/?a=1').searchParams.get('a');

const { runCheck } = await import(pathToFileURL(workerPath).href);
const log = console.log;
console.log = () => {};
const replays = new Map();
async function timed(answers) {
  if (!replays.has(answers)) replays.set(answers, replay(answers));
  const fetchImpl = replays.get(answers);
  const w = kv.writes;
  const b = kv.writeBytes;
  const s = process.cpuUsage();
  const out = await runCheck(env, { fetchImpl });
  if (out.errors) throw new Error(`replay failed: ${out.errors} errors`);
  const u = process.cpuUsage(s);
  return { ms: (u.user + u.system) / 1000, writes: kv.writes - w, bytes: kv.writeBytes - b, transitions: out.transitions };
}
const cold = await timed(!priming && args.includes('--cold-change') ? flipped : steam);
if (priming) {
  writeFileSync(statePath, JSON.stringify(Object.fromEntries(kv.store)));
  process.exit(0);
}
const same = [];
const change = [];
for (let i = 0; i < runs; i++) same.push(await timed(steam));
// Alternate the two sets so every one of these runs is a real status change.
for (let i = 0; i < runs; i++) change.push(await timed(i % 2 ? steam : flipped));
if (change.some((x) => !x.transitions)) throw new Error('a change run recorded no transition');
console.log = log;
const stat = (xs) => {
  if (!xs.length) return 'not run';
  const t = xs.map((x) => x.ms).sort((a, b) => a - b);
  const q = (p) => t[Math.min(t.length - 1, Math.floor(p * t.length))].toFixed(2);
  return `median ${q(0.5)} ms, p90 ${q(0.9)} ms, ${xs[0].writes} KV writes (${Math.round(xs[0].bytes / 1024)} KB)`;
};
console.log(`worker: ${path.relative(process.cwd(), workerPath) || workerPath}`);
console.log(`cold first run${args.includes('--cold-change') ? ' with a change' : ''}: ${cold.ms.toFixed(2)} ms, ${cold.writes} KV writes`);
console.log(`no change:      ${stat(same)}`);
console.log(`with a change:  ${stat(change)}`);
