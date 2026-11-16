import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { mergeEvent, mergeHistories } from '../lib/history-merge.mjs';
import { buildAtom, buildRss, feedEvents, feedScope, FEED_LIMIT } from '../lib/feed.mjs';
import { VALVE_SELLS } from '../lib/products.mjs';

const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'entry' || name === 'item' });
const rssItems = (xml) => parser.parse(xml).rss.channel.item || [];
const atomEntries = (xml) => parser.parse(xml).feed.entry || [];
const guidOf = (ts, key = 'steam-machine:PL') => `tag:steamhardwarestock.com,2026:${key}:${ts}`;

const SEED_TS = '2026-11-01T00:00:00.000Z';
const CHANGE_TS = '2026-11-13T15:00:00.000Z';
const SEED = {
  key: 'steam-machine:PL',
  productId: 'steam-machine',
  productName: 'Steam Machine',
  region: 'PL',
  source: 'steam',
  available: false,
  status: 'out_of_stock',
  ts: SEED_TS
};
const CHANGE = { ...SEED, available: true, status: 'in_stock', ts: CHANGE_TS };
const PATHS = ['', '/steam-machine', '/pl', '/steam-machine/pl'];
const scopeOf = (p) => feedScope(p.split('/').filter(Boolean));

function seeded(thenChange = false) {
  const history = {};
  assert.equal(mergeEvent(history, SEED), true);
  if (thenChange) assert.equal(mergeEvent(history, CHANGE), true);
  return history;
}

test('the first recorded status for a pair is left out of every feed', () => {
  const history = seeded();
  const seedId = guidOf(SEED_TS);
  assert.equal(feedEvents(history).length, 0);
  for (const p of PATHS) {
    const scope = scopeOf(p);
    assert.equal(rssItems(buildRss(history, scope)).some((i) => i.guid['#text'] === seedId), false, `rss ${p || '/'}`);
    assert.equal(atomEntries(buildAtom(history, scope)).some((e) => e.id === seedId), false, `atom ${p || '/'}`);
  }
});

test('a later change is in every matching feed, and the first record is not', () => {
  const history = seeded(true);
  const events = feedEvents(history);
  assert.deepEqual(events.map((e) => e.ts), [CHANGE_TS]);
  assert.equal(events[0].title, 'Steam Machine in Poland: In stock');
  const changeId = guidOf(CHANGE_TS);
  const seedId = guidOf(SEED_TS);
  for (const p of PATHS) {
    const scope = scopeOf(p);
    const items = rssItems(buildRss(history, scope));
    const entries = atomEntries(buildAtom(history, scope));
    assert.equal(items.some((i) => i.guid['#text'] === changeId), true, `rss has change ${p || '/'}`);
    assert.equal(items.some((i) => i.guid['#text'] === seedId), false, `rss drops seed ${p || '/'}`);
    assert.equal(entries.some((e) => e.id === changeId), true, `atom has change ${p || '/'}`);
    assert.equal(entries.some((e) => e.id === seedId), false, `atom drops seed ${p || '/'}`);
  }
  for (const p of ['/steam-deck', '/us', '/steam-machine/us', '/steam-deck/pl']) {
    const items = rssItems(buildRss(history, scopeOf(p)));
    assert.equal(items.some((i) => i.guid['#text'] === changeId), false, `unrelated ${p}`);
  }
});

test('a new product does not burst the global feed with first records', () => {
  const history = {};
  for (const cc of VALVE_SELLS) {
    mergeEvent(history, {
      key: `steam-machine:${cc}`,
      productId: 'steam-machine',
      productName: 'Steam Machine',
      region: cc,
      source: 'steam',
      available: false,
      status: 'out_of_stock',
      ts: SEED_TS
    });
  }
  assert.ok(VALVE_SELLS.length > 1);
  assert.equal(feedEvents(history).length, 0);
  assert.equal(rssItems(buildRss(history)).length, 0);
  assert.equal(atomEntries(buildAtom(history)).length, 0);
  mergeEvent(history, CHANGE);
  const events = feedEvents(history);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Steam Machine in Poland: In stock');
});

function writePair(n, { key = 'steam-deck:US', start = 0 } = {}) {
  const history = {};
  const base = { key, productId: 'steam-deck', productName: 'Steam Deck', region: 'US', source: 'steam' };
  for (let i = 0; i < n; i++) {
    const available = i % 2 === 1;
    mergeEvent(history, {
      ...base,
      available,
      status: available ? 'in_stock' : 'out_of_stock',
      ts: new Date(Date.UTC(2026, 0, 1, 0, start + i)).toISOString()
    });
  }
  return history;
}

test('a seed still in a full 50-event history is left out, and the oldest real change stays', () => {
  // One seed plus 49 changes fills the cap. The seed is still the oldest event.
  const history = writePair(50);
  const events = history['steam-deck:US'].events;
  assert.equal(events.length, 50);
  const seedTs = '2026-01-01T00:00:00.000Z';
  const firstChangeTs = '2026-01-01T00:01:00.000Z';
  assert.equal(events[events.length - 1].ts, seedTs);
  const feed = feedEvents(history);
  const ts = feed.map((e) => e.ts);
  assert.equal(ts.includes(seedTs), false);
  assert.equal(ts.includes(firstChangeTs), true);
  assert.equal(feed.length, 49);
});

test('once the cap evicts the seed, the oldest kept event is a real change and stays in the feed', () => {
  // One seed plus 50 changes: the seed is evicted, 50 real changes remain.
  const history = writePair(51);
  const events = history['steam-deck:US'].events;
  assert.equal(events.length, 50);
  const seedTs = '2026-01-01T00:00:00.000Z';
  const firstChangeTs = '2026-01-01T00:01:00.000Z';
  assert.equal(events[events.length - 1].ts, firstChangeTs);
  const ts = feedEvents(history).map((e) => e.ts);
  assert.equal(ts.includes(seedTs), false);
  assert.equal(ts.includes(firstChangeTs), true);
  assert.equal(ts.length, FEED_LIMIT);
});

test('unmarked history under the cap still drops the oldest event', () => {
  const history = {
    'steam-deck:US': {
      productId: 'steam-deck',
      productName: 'Steam Deck',
      region: 'US',
      events: [
        { ts: '2026-10-13T18:00:00.000Z', available: true, status: 'in_stock' },
        { ts: '2026-10-12T09:00:00.000Z', available: false, status: 'out_of_stock' }
      ]
    }
  };
  assert.deepEqual(feedEvents(history).map((e) => e.ts), ['2026-10-13T18:00:00.000Z']);
});

test('unmarked history at the cap keeps the oldest event, because it may be a real change', () => {
  const events = Array.from({ length: 50 }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 0, 1, 0, 50 - i)).toISOString(),
    available: i % 2 === 0
  }));
  const history = {
    'steam-deck:US': { productId: 'steam-deck', productName: 'Steam Deck', region: 'US', events }
  };
  const ts = feedEvents(history).map((e) => e.ts);
  assert.equal(ts.length, 50);
  assert.equal(ts[ts.length - 1], events[49].ts);
});

test('a null record in history does not stop the feed publishing a real change', () => {
  const history = {
    'steam-deck:US': {
      productId: 'steam-deck',
      productName: 'Steam Deck',
      region: 'US',
      events: [
        { ts: '2026-10-13T18:00:00.000Z', available: true, status: 'in_stock' },
        null,
        { ts: '2026-10-12T09:00:00.000Z', available: false, status: 'out_of_stock' }
      ]
    }
  };
  assert.deepEqual(feedEvents(history).map((e) => e.ts), ['2026-10-13T18:00:00.000Z']);
});

test('importing a cap-full history after the seed was evicted keeps every real change', () => {
  const live = writePair(51);
  assert.equal(live['steam-deck:US'].events.length, 50);
  assert.equal(feedEvents(live).length, 50);
  const { merged } = mergeHistories({}, live);
  assert.equal(merged['steam-deck:US'].events.length, 50);
  assert.equal(merged['steam-deck:US'].events.some((e) => e && e.seed), false);
  const ts = feedEvents(merged).map((e) => e.ts);
  assert.equal(ts.length, 50);
  assert.equal(ts.includes('2026-01-01T00:01:00.000Z'), true);
});

test('importing history keeps a marked seed and still leaves it out of the feed', () => {
  const live = writePair(2);
  assert.equal(live['steam-deck:US'].events[1].seed, true);
  const { merged } = mergeHistories({}, live);
  assert.equal(merged['steam-deck:US'].events[1].seed, true);
  assert.deepEqual(feedEvents(merged).map((e) => e.ts), ['2026-01-01T00:01:00.000Z']);
});
