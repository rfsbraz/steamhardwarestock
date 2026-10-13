#!/usr/bin/env node
// One-off: merge an old Blob stock-history.json export into the KV copy.
// Dry run by default. Pass --apply to write. See docs/cloudflare.md.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeHistories } from '../lib/history-merge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'stock-history.json';

export function namespaceId(tomlPath = path.join(ROOT, 'wrangler.toml')) {
  const toml = readFileSync(tomlPath, 'utf8');
  const block = toml.match(/\[\[kv_namespaces\]\][^[]*?binding\s*=\s*"STOCK_KV"[^[]*/);
  const id = block && block[0].match(/\bid\s*=\s*"([^"]+)"/);
  if (!id) throw new Error(`No STOCK_KV namespace id in ${tomlPath}`);
  return id[1];
}

function defaultWrangler(args) {
  const res = spawnSync('npx', ['--yes', 'wrangler@4', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || String(res.error || '') };
}

function readKv(wrangler, ns) {
  const res = wrangler(['kv', 'key', 'get', KEY, '--namespace-id', ns, '--remote', '--text']);
  if (res.status !== 0) {
    if (/not found/i.test(res.stderr + res.stdout)) return { raw: '', doc: {} };
    throw new Error(`wrangler kv key get failed: ${res.stderr.trim()}`);
  }
  const raw = res.stdout.trim();
  return { raw, doc: raw ? parseHistory(raw, 'KV value') : {} };
}

function parseHistory(text, label) {
  const doc = JSON.parse(text);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`${label} is not a history object`);
  return doc;
}

export async function run(argv, { wrangler = defaultWrangler, log = console.log, backupDir = path.join(ROOT, 'backups') } = {}) {
  const apply = argv.includes('--apply');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    log('Usage: node scripts/import-blob-history.mjs <blob-export.json> [--apply]');
    return 2;
  }
  let blob;
  try {
    blob = parseHistory(readFileSync(file, 'utf8'), file);
  } catch (err) {
    log(`Cannot read ${file}: ${err.message}`);
    return 2;
  }

  const ns = namespaceId();
  const current = readKv(wrangler, ns);
  const { merged, stats } = mergeHistories(current.doc, blob);

  log(`${apply ? 'Apply' : 'Dry run'}: ${KEY} in namespace ${ns}`);
  log(`KV keys: ${stats.kvKeys}, events: ${stats.kvEvents}`);
  log(`Blob keys: ${stats.blobKeys}, events: ${stats.blobEvents}`);
  log(`Merged keys: ${stats.mergedKeys}, events: ${stats.mergedEvents}`);
  log(`new keys: ${stats.newKeys}, events added: ${stats.addedEvents}`);
  if (!apply) {
    log('Nothing written. Run again with --apply to write to KV.');
    return 0;
  }

  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `kv-stock-history-${stamp}.json`);
  writeFileSync(backup, current.raw || '{}');
  log(`Backed up current KV value to ${backup}`);

  // The Worker writes this key on every status change. Abort rather than
  // overwrite a write that landed while we were merging.
  if (readKv(wrangler, ns).raw !== current.raw) {
    log('KV changed since it was read. Nothing written. Run again.');
    return 1;
  }

  const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'shs-history-')), KEY);
  writeFileSync(out, JSON.stringify(merged));
  const res = wrangler(['kv', 'key', 'put', KEY, '--namespace-id', ns, '--remote', '--path', out]);
  if (res.status !== 0) {
    log(`wrangler kv key put failed: ${res.stderr.trim()}`);
    return 1;
  }
  log(`Wrote ${stats.mergedKeys} keys to KV.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(err.message);
    process.exit(1);
  });
}
