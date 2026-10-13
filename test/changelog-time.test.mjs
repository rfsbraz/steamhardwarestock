import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ChangelogTime from '../public/changelog-time.js';

const { dayKey, groupEntries } = ChangelogTime;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e = (ts) => ({ ts, productName: 'Steam Deck', region: 'US', label: 'In stock', available: true });

test('day keys follow the given time zone, not UTC', () => {
  const ts = '2026-10-13T02:30:00Z';
  assert.equal(dayKey(ts, 'UTC'), '2026-10-13');
  assert.equal(dayKey(ts, 'America/Los_Angeles'), '2026-10-12');
  assert.equal(dayKey(ts, 'Asia/Tokyo'), '2026-10-13');
  assert.equal(dayKey('2026-10-12T16:00:00Z', 'Asia/Tokyo'), '2026-10-13');
});

test('entries split at local midnight into Today, Yesterday and dated groups', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const entries = [e('2026-10-13T08:00:00Z'), e('2026-10-13T03:00:00Z'), e('2026-10-12T20:00:00Z'), e('2026-10-11T10:00:00Z')];
  const ny = groupEntries(entries, { now, timeZone: 'America/New_York', locale: 'en-US' });
  // New York is UTC-4: 03:00Z is still Oct 12 there.
  assert.deepEqual(ny.map((g) => g.label), ['Today', 'Yesterday', 'Sun, Oct 11']);
  assert.deepEqual(ny.map((g) => g.entries.length), [1, 2, 1]);
  const tokyo = groupEntries(entries, { now, timeZone: 'Asia/Tokyo', locale: 'en-US' });
  // Tokyo is UTC+9: 20:00Z on Oct 12 is already Oct 13.
  assert.deepEqual(tokyo.map((g) => g.label), ['Today', 'Sun, Oct 11']);
  assert.deepEqual(tokyo.map((g) => g.entries.length), [3, 1]);
});

test('Today and Yesterday move with the visitor clock across midnight', () => {
  const entries = [e('2026-10-12T23:30:00Z')];
  const before = groupEntries(entries, { now: new Date('2026-10-12T23:59:00Z'), timeZone: 'UTC', locale: 'en-US' });
  const after = groupEntries(entries, { now: new Date('2026-10-13T00:01:00Z'), timeZone: 'UTC', locale: 'en-US' });
  assert.equal(before[0].label, 'Today');
  assert.equal(after[0].label, 'Yesterday');
  const older = groupEntries(entries, { now: new Date('2026-10-15T00:01:00Z'), timeZone: 'UTC', locale: 'en-US' });
  assert.equal(older[0].label, 'Mon, Oct 12');
});

test('older years show the year, and labels use the visitor locale', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const [g] = groupEntries([e('2025-12-30T12:00:00Z')], { now, timeZone: 'UTC', locale: 'en-US' });
  assert.match(g.label, /2025/);
  const [pt] = groupEntries([e('2026-10-11T12:00:00Z')], { now, timeZone: 'UTC', locale: 'pt-PT' });
  assert.match(pt.label, /dom/i);
  assert.match(pt.label, /11/);
});

test('each row has the time, a full date title and an ISO datetime', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const [g] = groupEntries([e('2026-10-13T08:05:09.123Z')], { now, timeZone: 'Europe/Lisbon', locale: 'en-GB' });
  const row = g.entries[0];
  assert.equal(row.datetime, '2026-10-13T08:05:09.123Z');
  assert.match(row.time, /^09:05/);
  assert.match(row.title, /Tuesday/);
  assert.match(row.title, /13 October 2026/);
  assert.match(row.title, /09:05:09/);
});

test('bad timestamps are skipped, not shown as a wrong date', () => {
  const groups = groupEntries([e('nope'), e('2026-10-13T08:00:00Z')], { now: new Date('2026-10-13T12:00:00Z'), timeZone: 'UTC', locale: 'en-US' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entries.length, 1);
});

test('app.js renders <time datetime> with a title under date headers', () => {
  const app = readFileSync(path.join(root, 'public/app.js'), 'utf8');
  assert.match(app, /createElement\('time'\)/);
  assert.match(app, /\.dateTime = /);
  assert.match(app, /\.title = /);
  assert.match(app, /changelog-date/);
});

for (const cf of ['', '1']) {
  test(`built HTML ships no changelog dates before JS runs (CF_PAGES=${cf || 'unset'})`, () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-changelog-'));
    execFileSync(process.execPath, ['scripts/build.js'], {
      cwd: root,
      env: { ...process.env, BUILD_DIST: dist, PRERENDER_OFFLINE: '1', PRERENDER_SOURCE_URL: '', CF_PAGES: cf },
      stdio: 'pipe'
    });
    const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
    assert.match(html, /<div id="changelogList" class="changelog-list"[^>]*><\/div>/);
    assert.ok(!/changelog-date/.test(html.replace(/<style[\s\S]*?<\/style>/g, '')), 'date headers are client-only');
    const script = readdirSync(dist).find((f) => /^changelog-time\.[0-9a-f]+\.js$/.test(f));
    assert.ok(script, 'changelog-time.js is hashed');
    assert.ok(html.includes(`src="/${script}"`), 'index.html loads the hashed script');
    if (cf) assert.match(readFileSync(path.join(dist, '_headers'), 'utf8'), /\/changelog-time\.\*\.js/);
  });
}
