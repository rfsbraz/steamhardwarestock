import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeHistories } from '../lib/history-merge.mjs';
import { run, namespaceId } from '../scripts/import-blob-history.mjs';

const kv = {
  'steam-deck:US': {
    productId: 'steam-deck', productName: 'Steam Deck', region: 'US', source: 'steam',
    events: [{ ts: '2026-10-13T18:00:00.000Z', available: true, status: 'in_stock' }],
    lastInStock: '2026-10-13T18:00:00.000Z', status: 'in_stock'
  }
};
const blob = {
  'steam-deck:US': {
    productId: 'steam-deck', productName: 'Steam Deck', region: 'US', source: 'steam',
    events: [
      { ts: '2026-10-10T09:00:00.000Z', available: false, status: 'out_of_stock' },
      { ts: '2026-10-01T09:00:00.000Z', available: true, status: 'in_stock' },
      { ts: '2026-10-01T09:00:00.000Z', available: true, status: 'in_stock' }
    ]
  },
  'steam-dock:GB': {
    productId: 'steam-dock', productName: 'Steam Deck Dock', region: 'GB', source: 'steam',
    events: [{ ts: '2026-09-01T00:00:00.000Z', available: false }]
  }
};

test('mergeHistories combines both sides newest first, dedupes, and keeps the newest state', () => {
  const { merged, stats } = mergeHistories(kv, blob);
  const us = merged['steam-deck:US'];
  assert.deepEqual(us.events.map((e) => e.ts), ['2026-10-13T18:00:00.000Z', '2026-10-10T09:00:00.000Z', '2026-10-01T09:00:00.000Z']);
  assert.equal(us.status, 'in_stock');
  assert.equal(us.lastInStock, '2026-10-13T18:00:00.000Z');
  assert.equal(us.lastOutOfStock, '2026-10-10T09:00:00.000Z');
  assert.ok(merged['steam-dock:GB']);
  assert.deepEqual(stats, { kvKeys: 1, blobKeys: 2, mergedKeys: 2, newKeys: 1, kvEvents: 1, blobEvents: 4, mergedEvents: 4, addedEvents: 3 });
  assert.equal(kv['steam-deck:US'].events.length, 1, 'inputs are not modified');
});

test('consecutive repeats of the same state collapse, like the cron does', () => {
  const a = { k: { productId: 'p', region: 'US', events: [{ ts: '2026-01-03T00:00:00Z', available: true, status: 'in_stock' }] } };
  const b = { k: { productId: 'p', region: 'US', events: [{ ts: '2026-01-02T00:00:00Z', available: true, status: 'in_stock' }, { ts: '2026-01-01T00:00:00Z', available: false }] } };
  const { merged } = mergeHistories(a, b);
  assert.deepEqual(merged.k.events.map((e) => e.ts), ['2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z']);
});

test('merging the same export twice changes nothing', () => {
  const once = mergeHistories(kv, blob).merged;
  const twice = mergeHistories(once, blob);
  assert.deepEqual(twice.merged, once);
  assert.equal(twice.stats.addedEvents, 0);
});

test('reads the KV namespace id from wrangler.toml', () => {
  assert.equal(namespaceId(), 'ef31e7789d0949b987f9814a86ed0fce');
});

function setup() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'shs-import-'));
  const blobFile = path.join(dir, 'blob.json');
  writeFileSync(blobFile, JSON.stringify(blob));
  const calls = [];
  const wrangler = (args) => {
    calls.push(args);
    if (args[2] === 'get') return { status: 0, stdout: JSON.stringify(kv), stderr: '' };
    if (args[2] === 'put') return { status: 0, stdout: '', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
  const out = [];
  return { dir, blobFile, calls, wrangler, out, log: (s) => out.push(s) };
}

test('dry run reads KV, prints counts and writes nothing', async () => {
  const s = setup();
  const code = await run([s.blobFile], { wrangler: s.wrangler, log: s.log, backupDir: s.dir });
  assert.equal(code, 0);
  assert.ok(s.calls.every((a) => a[2] === 'get'), 'dry run only reads');
  assert.ok(s.calls[0].includes('--remote') && s.calls[0].includes('ef31e7789d0949b987f9814a86ed0fce'));
  const text = s.out.join('\n');
  assert.match(text, /Dry run/);
  assert.match(text, /new keys: 1/);
  assert.match(text, /events added: 3/);
  assert.deepEqual(readdirSync(s.dir), ['blob.json']);
});

test('--apply backs up KV first, then puts the merged history with --remote', async () => {
  const s = setup();
  const code = await run([s.blobFile, '--apply'], { wrangler: s.wrangler, log: s.log, backupDir: s.dir });
  assert.equal(code, 0);
  const backup = readdirSync(s.dir).find((f) => f.startsWith('kv-stock-history-'));
  assert.ok(backup, 'no backup written');
  assert.deepEqual(JSON.parse(readFileSync(path.join(s.dir, backup), 'utf8')), kv);
  const put = s.calls.find((a) => a[2] === 'put');
  assert.ok(put.includes('--remote') && put.includes('stock-history.json'));
  const file = put[put.indexOf('--path') + 1];
  assert.ok(existsSync(file));
  assert.equal(Object.keys(JSON.parse(readFileSync(file, 'utf8'))).length, 2);
  const order = s.calls.map((a) => a[2]);
  assert.deepEqual(order, ['get', 'get', 'put'], 'reads again right before writing');
});

test('--apply aborts when KV changed after the first read', async () => {
  const s = setup();
  let reads = 0;
  const wrangler = (args) => {
    s.calls.push(args);
    if (args[2] === 'get') return { status: 0, stdout: JSON.stringify(reads++ ? { changed: { events: [] } } : kv), stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const code = await run([s.blobFile, '--apply'], { wrangler, log: s.log, backupDir: s.dir });
  assert.equal(code, 1);
  assert.ok(!s.calls.some((a) => a[2] === 'put'));
});

test('a missing KV key counts as empty, and bad input fails', async () => {
  const s = setup();
  const empty = (args) => (args[2] === 'get' ? { status: 1, stdout: '', stderr: 'Value not found' } : { status: 0, stdout: '', stderr: '' });
  assert.equal(await run([s.blobFile], { wrangler: empty, log: s.log, backupDir: s.dir }), 0);
  assert.match(s.out.join('\n'), /KV keys: 0/);
  assert.equal(await run([], { wrangler: s.wrangler, log: s.log, backupDir: s.dir }), 2);
  const bad = path.join(s.dir, 'bad.json');
  writeFileSync(bad, '[1,2]');
  assert.equal(await run([bad], { wrangler: s.wrangler, log: s.log, backupDir: s.dir }), 2);
});
