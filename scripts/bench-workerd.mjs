#!/usr/bin/env node
// Measures the cron Worker in workerd, the real Workers runtime, with live
// Steam requests (read-only GETs) and a local in-memory KV. Nothing is
// deployed and production KV is never touched.
//
//   npm i --no-save miniflare@3     # once; Linux only (reads /proc)
//   node scripts/bench-worker.mjs --capture   # once, for the history seed
//   node scripts/bench-workerd.mjs [--worker cloudflare/worker.mjs] [--runs 12] [--full]
//
// CPU is the workerd process time per scheduled run, from
// /proc/<pid>/task/*/schedstat. It includes runtime work that Cloudflare may
// not bill (local TLS, the KV simulator), so compare versions with it rather
// than reading it as the dashboard number. An empty Worker that only touches
// KV measures about 3 ms here. --full wipes the fingerprints before each run,
// so every run is a full check.
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const workerPath = path.resolve(opt('worker', path.join(root, 'cloudflare/worker.mjs')));
const runs = Number(opt('runs', 12));
const dir = opt('dir', '/tmp/shs-bench');
const full = args.includes('--full');

let Miniflare;
try {
  ({ Miniflare } = await import('miniflare'));
} catch {
  console.error('miniflare is not installed: npm i --no-save miniflare@3');
  process.exit(1);
}
// workerd only accepts handlers as named exports, so bundle a wrapper that
// re-exports the default handler, like the deployed script.
// workerd resolves scriptPath under the current directory, so the bundle goes
// in a scratch folder here (ignored by git).
const tmp = mkdtempSync(path.join(process.cwd(), '.bench-workerd-'));
writeFileSync(path.join(tmp, 'entry.mjs'), `import w from ${JSON.stringify(workerPath)}; export default w;`);
execFileSync('npx', ['--yes', 'esbuild@0.24', path.join(tmp, 'entry.mjs'), '--bundle', '--format=esm', '--minify', `--outfile=${path.join(tmp, 'w.mjs')}`, '--log-level=warning'], { stdio: 'inherit' });

const mf = new Miniflare({ modules: true, scriptPath: path.relative(process.cwd(), path.join(tmp, 'w.mjs')), compatibilityDate: '2025-07-01', kvNamespaces: ['STOCK_KV'] });
await mf.ready;
const kv = await mf.getKVNamespace('STOCK_KV');
await kv.put('stock-history.json', readFileSync(path.join(dir, 'history.json'), 'utf8'));
const worker = await mf.getWorker();
const pids = execSync('pgrep -f workerd').toString().trim().split('\n');
const cpuNs = () => {
  let t = 0;
  for (const p of pids) {
    try {
      for (const task of readdirSync(`/proc/${p}/task`)) t += Number(readFileSync(`/proc/${p}/task/${task}/schedstat`, 'utf8').split(' ')[0]);
    } catch {}
  }
  return t;
};
const log = console.log;
console.log = () => {};
const run = () => worker.scheduled({ cron: '*/10 * * * *' });
await run();
await run();
const ms = [];
for (let i = 0; i < runs; i++) {
  if (full) {
    const meta = JSON.parse((await kv.get('status-meta')) || '{}');
    await kv.put('status-meta', JSON.stringify({ generatedAt: meta.generatedAt }));
    await kv.put('steam-raw', 'x');
    await kv.put('status-body', '{}');
  }
  const s = cpuNs();
  await run();
  ms.push((cpuNs() - s) / 1e6);
}
await mf.dispose();
rmSync(tmp, { recursive: true, force: true });
ms.sort((a, b) => a - b);
const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(2);
console.log = log;
console.log(`${path.relative(process.cwd(), workerPath)} ${full ? 'full check' : 'quiet run'}: median ${q(0.5)} ms, p90 ${q(0.9)} ms (${runs} runs, workerd process CPU)`);
