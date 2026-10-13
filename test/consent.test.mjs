import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Consent from '../public/consent.js';
import { CONSENT_REGIONS, ANALYTICS_HEAD } from '../lib/analytics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

const EU27 = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

test('the consent default covers the EEA, the UK and Switzerland', () => {
  for (const cc of [...EU27, 'IS', 'LI', 'NO', 'GB', 'CH']) assert.ok(CONSENT_REGIONS.includes(cc), cc);
  assert.equal(CONSENT_REGIONS.length, 32);
  assert.ok(!CONSENT_REGIONS.includes('US'));
});

test('the head sets denied defaults for those regions before config, and granted elsewhere', () => {
  const calls = [];
  const sandbox = { window: {}, localStorage: memoryStorage(), dataLayer: undefined };
  const scripts = [...ANALYTICS_HEAD.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const run = new Function('window', 'localStorage', 'Date', `${scripts.join('\n')}; return window.dataLayer;`);
  const dl = run(sandbox.window, sandbox.localStorage, Date);
  for (const args of dl) calls.push(Array.from(args));
  const kinds = calls.map((c) => `${c[0]}:${c[1] instanceof Date ? 'date' : c[1]}`);
  assert.ok(kinds.indexOf('consent:default') < kinds.indexOf('config:G-D4LRTXD5LR'));
  const defaults = calls.filter((c) => c[0] === 'consent' && c[1] === 'default');
  assert.equal(defaults.length, 2);
  const regional = defaults.find((c) => c[2].region);
  assert.deepEqual(regional[2].region, CONSENT_REGIONS);
  for (const k of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
    assert.equal(regional[2][k], 'denied', k);
    assert.equal(defaults.find((c) => !c[2].region)[2][k], 'granted', k);
  }
  assert.ok(regional[2].wait_for_update > 0);
  assert.ok(!calls.some((c) => c[0] === 'consent' && c[1] === 'update'), 'no stored choice means no update');
});

test('a stored choice is applied in the head, before config', () => {
  for (const choice of ['granted', 'denied']) {
    const w = {};
    const scripts = [...ANALYTICS_HEAD.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const dl = new Function('window', 'localStorage', `${scripts.join('\n')}; return window.dataLayer;`)(w, memoryStorage({ 'shs-consent': choice }));
    const calls = dl.map((a) => Array.from(a));
    const update = calls.findIndex((c) => c[0] === 'consent' && c[1] === 'update');
    assert.ok(update > -1 && update < calls.findIndex((c) => c[0] === 'config'), choice);
    assert.equal(calls[update][2].analytics_storage, choice);
    assert.equal(calls[update][2].ad_user_data, choice);
  }
});

test('a broken localStorage does not stop GA from loading', () => {
  const scripts = [...ANALYTICS_HEAD.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const throwing = { getItem() { throw new Error('blocked'); } };
  const dl = new Function('window', 'localStorage', `${scripts.join('\n')}; return window.dataLayer;`)({}, throwing);
  assert.ok(dl.some((a) => a[0] === 'config'));
});

test('the banner is shown for consent-region time zones and when unsure', () => {
  for (const tz of ['Europe/Lisbon', 'Europe/London', 'Europe/Berlin', 'Europe/Oslo', 'Europe/Zurich', 'Atlantic/Reykjavik', 'Europe/Vaduz', 'Atlantic/Canary', 'Asia/Nicosia', 'UTC', '', undefined]) {
    assert.equal(Consent.needsBanner(tz), true, String(tz));
  }
  for (const tz of ['America/New_York', 'America/Toronto', 'Australia/Sydney', 'Asia/Tokyo', 'Europe/Moscow', 'Europe/Istanbul', 'Europe/Kyiv']) {
    assert.equal(Consent.needsBanner(tz), false, tz);
  }
});

test('the choice is saved, read back and pushed to gtag', () => {
  const storage = memoryStorage();
  const calls = [];
  const gtag = (...a) => calls.push(a);
  assert.equal(Consent.readChoice(storage), null);
  Consent.saveChoice(storage, 'granted', gtag);
  assert.equal(storage.data['shs-consent'], 'granted');
  assert.equal(Consent.readChoice(storage), 'granted');
  assert.deepEqual(calls[0].slice(0, 2), ['consent', 'update']);
  assert.deepEqual(calls[0][2], { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
  Consent.saveChoice(storage, 'denied', gtag);
  assert.equal(Consent.readChoice(storage), 'denied');
  assert.equal(calls[1][2].analytics_storage, 'denied');
  assert.equal(Consent.readChoice(memoryStorage({ 'shs-consent': 'junk' })), null);
  assert.doesNotThrow(() => Consent.saveChoice({ setItem() { throw new Error('full'); } }, 'granted', gtag));
  assert.doesNotThrow(() => Consent.saveChoice(storage, 'granted', undefined));
});

test('the banner shows only when needed and not after a choice', () => {
  assert.equal(Consent.shouldShow({ timeZone: 'Europe/Paris', choice: null }), true);
  assert.equal(Consent.shouldShow({ timeZone: 'Europe/Paris', choice: 'denied' }), false);
  assert.equal(Consent.shouldShow({ timeZone: 'America/Chicago', choice: null }), false);
});

test('the banner markup is accessible and the buttons are equal', () => {
  const html = Consent.bannerHtml();
  assert.match(html, /role="region"/);
  assert.match(html, /aria-labelledby="consent-title"/);
  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)];
  assert.equal(buttons.length, 2);
  const cls = buttons.map((b) => b[0].match(/class="([^"]+)"/)[1]);
  assert.equal(cls[0], cls[1], 'accept and reject share one style');
  assert.deepEqual(buttons.map((b) => b[1]).sort(), ['Accept', 'Reject']);
  assert.doesNotMatch(html, /\u2014/);
});

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

for (const cf of ['', '1']) {
  test(`every built page sets consent before config and has the banner and settings link${cf ? ' (CF_PAGES=1)' : ''}`, () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'shs-consent-'));
    execFileSync(process.execPath, ['scripts/build.js'], {
      cwd: root,
      env: { ...process.env, PRERENDER_OFFLINE: '1', BLOB_READ_WRITE_TOKEN: '', PRERENDER_SOURCE_URL: '', BUILD_DIST: dist, CF_PAGES: cf },
      stdio: 'pipe'
    });
    const files = htmlFiles(dist);
    assert.ok(files.length > 100);
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      const rel = path.relative(dist, file);
      const def = html.indexOf("gtag('consent', 'default'");
      const loader = html.indexOf('googletagmanager.com/gtag/js');
      const config = html.indexOf("gtag('config'");
      assert.ok(def > -1 && def < config && def < loader, `${rel}: consent default must come before the GA loader and config`);
      assert.ok(html.includes('SteamConsent'), `${rel}: banner script missing`);
      assert.match(html, /<footer[\s\S]*data-consent-settings[\s\S]*<\/footer>/, `${rel}: settings link missing from the footer`);
    }
  });
}
