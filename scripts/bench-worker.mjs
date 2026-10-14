#!/usr/bin/env node
// Local CPU benchmark for the cron Worker. Network waits are not billed as CPU
// on Workers, so Steam is replayed from a capture and KV is an in-memory map
// seeded with real-sized copies of the production values.
//
//   node scripts/bench-worker.mjs --capture   # save Steam answers and the
//                                             # public /status.json and
//                                             # /api/history (read-only)
//   node scripts/bench-worker.mjs [--worker path/to/worker.mjs] [--runs 40] [--cold 15] [--no-bundle]
//
// Reports, for a run where nothing changed and a run with a status change:
//   cold: a fresh process per sample, timing the Worker module import and
//         its first run together, which is closest to a new isolate. A cron
//         that fires every 10 minutes usually lands on a new isolate.
//   warm: later runs in the same process.
// KV starts as a previous run of the same worker left it (primed in a child
// process), so each timed run is a normal steady-state run.
// Compare two versions with --worker, for example a copy of the old
// worker.mjs saved next to the current one.
//
// Replayed fetches cost almost nothing here, but on Workers each Steam
// subrequest costs about 0.4 ms of CPU, which is most of a run. The
// "Steam requests" column shows that part; scripts/bench-workerd.mjs
// measures it in the real runtime.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const dir = opt('dir', '/tmp/shs-bench');
const runs = Number(opt('runs', 40));
const coldRuns = Number(opt('cold', 15));
const root = path.resolve(path.dirname(self), '..');
const workerPath = path.resolve(opt('worker', path.join(root, 'cloudflare/worker.mjs')));
const mode = opt('mode', 'main');
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
// A second set of answers where the US stops selling everything, to time a
// run with a real status change.
const flipped = JSON.parse(JSON.stringify(steam));
{
  const us = JSON.parse(flipped.US);
  for (const d of us.response.details) d.allow_purchase_in_country = false;
  flipped.US = JSON.stringify(us);
}
const statePath = opt('state', path.join(dir, `state-${Buffer.from(workerPath).toString('hex').slice(-32)}.json`));

if (mode === 'main') {
  execFileSync(process.execPath, [self, '--mode', 'prime', '--worker', workerPath, '--dir', dir]);
  // Workers runs one bundled script, and Node's loader is much slower on many
  // small modules than on one file, so cold runs import an esbuild bundle like
  // the one wrangler deploys. --no-bundle imports the source as is.
  let target = workerPath;
  if (!args.includes('--no-bundle')) {
    target = path.join(dir, `bundle-${path.basename(statePath, '.json')}.mjs`);
    execFileSync('npx', ['--yes', 'esbuild@0.24', workerPath, '--bundle', '--format=esm', '--minify', `--outfile=${target}`, '--log-level=warning'], { stdio: 'inherit' });
  }
  const child = (m) => JSON.parse(execFileSync(process.execPath, [self, '--mode', m, '--worker', m.startsWith('cold') ? target : workerPath, '--state', statePath, '--dir', dir, '--runs', String(runs)], { encoding: 'utf8' }));
  const coldSame = [];
  const coldChange = [];
  for (let i = 0; i < coldRuns; i++) {
    coldSame.push(child('cold-same').ms);
    coldChange.push(child('cold-change').ms);
  }
  const warm = child('warm');
  const stat = (t) => {
    t = [...t].sort((a, b) => a - b);
    const q = (p) => t[Math.min(t.length - 1, Math.floor(p * t.length))].toFixed(2);
    return `median ${q(0.5)} ms, p90 ${q(0.9)} ms`;
  };
  console.log(`worker: ${path.relative(process.cwd(), workerPath) || workerPath}`);
  console.log(`cold, no change:    ${stat(coldSame)} (${coldRuns} fresh processes)`);
  console.log(`cold, with change:  ${stat(coldChange)}`);
  console.log(`warm, no change:    ${stat(warm.same)}, ${warm.sameWrites} KV writes (${warm.sameBytes} B), ${warm.sameReadBytes} B read, up to ${warm.sameFetches} Steam requests`);
  console.log(`warm, with change:  ${stat(warm.change)}, ${warm.changeWrites} KV writes (${Math.round(warm.changeBytes / 1024)} KB), ${warm.changeFetches} Steam requests`);
  process.exit(0);
}

const start = mode === 'prime'
  ? { 'status.json': readFileSync(path.join(dir, 'status.json'), 'utf8'), 'stock-history.json': readFileSync(path.join(dir, 'history.json'), 'utf8') }
  : JSON.parse(readFileSync(statePath, 'utf8'));
const kv = { store: new Map(Object.entries(start)), writes: 0, writeBytes: 0, readBytes: 0 };
const env = {
  STOCK_KV: {
    async get(k) { const v = kv.store.get(k) ?? null; kv.readBytes += v ? v.length : 0; return v; },
    async put(k, v) { kv.writes++; kv.writeBytes += v.length; kv.store.set(k, v); }
  }
};
// Answers are prepared up front as bytes, as Workers receives them. Turning
// them into text or JSON is the Worker's own work, so it stays in the timing.
const enc = new TextEncoder();
const prep = (answers) => Object.fromEntries(Object.entries(answers).map(([cc, t]) => [cc, enc.encode(t)]));
const replay = (answers) => {
  const bytes = prep(answers);
  const dec = new TextDecoder();
  return async (url) => {
    fetches++;
    const b = bytes[regionOf(url)];
    return { ok: true, status: 200, arrayBuffer: async () => b.slice().buffer, text: async () => dec.decode(b) };
  };
};
let fetches = 0;
const fetchSame = replay(steam);
const fetchChange = replay(flipped);
// Node loads some built-ins lazily on first use. Workers has them ready, so
// touch them before timing.
await crypto.subtle.digest('SHA-256', enc.encode('warm'));
new TextDecoder().decode(enc.encode('warm'));
clearTimeout(setTimeout(() => {}, 1));
new AbortController().abort();
new URL('https://example.com/?a=1').searchParams.get('a');
console.log = () => {};

const t0 = process.cpuUsage();
const { runCheck } = await import(pathToFileURL(workerPath).href);
async function timed(fetchImpl) {
  const w = kv.writes; const b = kv.writeBytes; const r = kv.readBytes; const f = fetches;
  const s = process.cpuUsage();
  const out = await runCheck(env, { fetchImpl });
  const u = process.cpuUsage(s);
  if (out.errors) throw new Error(`replay failed: ${out.errors} errors`);
  return { ms: (u.user + u.system) / 1000, writes: kv.writes - w, bytes: kv.writeBytes - b, read: kv.readBytes - r, fetches: fetches - f, transitions: out.transitions };
}
const write = (o) => process.stdout.write(JSON.stringify(o));

if (mode === 'prime') {
  await timed(fetchSame);
  await timed(fetchSame);
  writeFileSync(statePath, JSON.stringify(Object.fromEntries(kv.store)));
} else if (mode === 'cold-same' || mode === 'cold-change') {
  await runCheck(env, { fetchImpl: mode === 'cold-same' ? fetchSame : fetchChange });
  const u = process.cpuUsage(t0);
  write({ ms: (u.user + u.system) / 1000 });
} else if (mode === 'warm') {
  const same = [];
  const change = [];
  for (let i = 0; i < runs; i++) same.push(await timed(fetchSame));
  // Alternate the two sets so every one of these runs is a real status change.
  for (let i = 0; i < runs; i++) change.push(await timed(i % 2 ? fetchSame : fetchChange));
  if (change.some((x) => !x.transitions)) throw new Error('a change run recorded no transition');
  write({
    same: same.map((x) => x.ms), sameWrites: same[0].writes, sameBytes: same[0].bytes, sameReadBytes: same[0].read, sameFetches: Math.max(...same.map((x) => x.fetches)), changeFetches: change[0].fetches,
    change: change.map((x) => x.ms), changeWrites: change[0].writes, changeBytes: change[0].bytes
  });
}
