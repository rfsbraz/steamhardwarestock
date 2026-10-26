import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import StockStatus from '../public/stock-status.js';
import { mergeEvent } from '../lib/history-merge.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/hardware-items.json', import.meta.url)));
const { classifyDetails, combineStatuses, STATUSES } = StockStatus;

test('lists the five status values', () => {
  assert.deepEqual(STATUSES, ['in_stock', 'reservation_open', 'waitlist', 'out_of_stock', 'unavailable_in_region']);
});

test('Steam Controller with open reservations is reservation_open, not out of stock', () => {
  const s = classifyDetails(fx['controller-us-reservation-open']);
  assert.equal(s.status, 'reservation_open');
  assert.equal(s.found, false);
  assert.equal(s.estimate, new Date(fx['controller-us-reservation-open'].rtime_estimated_notification * 1000).toISOString());
});

test('a reservation with a full order queue is a waitlist', () => {
  assert.equal(classifyDetails(fx['controller-gb-reservation-open-pending']).status, 'waitlist');
});

test('Frame and Machine queues are waitlist', () => {
  assert.equal(classifyDetails(fx['frame-us-waitlist']).status, 'waitlist');
  assert.equal(classifyDetails(fx['machine-us-waitlist']).status, 'waitlist');
});

test('normal stock states', () => {
  assert.equal(classifyDetails(fx['deck-us-in-stock']).status, 'in_stock');
  assert.equal(classifyDetails(fx['deck-us-in-stock']).found, true);
  assert.equal(classifyDetails(fx['dock-us-out-of-stock']).status, 'out_of_stock');
  assert.equal(classifyDetails(fx['deck-jp-not-sold']).status, 'unavailable_in_region');
  assert.equal(classifyDetails(null).status, 'out_of_stock');
});

test('an item Steam flags as high demand is in stock while it has inventory', () => {
  for (const key of ['index-base-station-us-in-stock-high-demand', 'frame-psu-us-in-stock-high-demand']) {
    const s = classifyDetails(fx[key]);
    assert.equal(s.status, 'in_stock', key);
    assert.equal(s.found, true, key);
    assert.match(s.reason, /high demand/, key);
  }
  assert.equal(classifyDetails(fx['frame-psu-au-in-stock']).status, 'in_stock');
});

test('high demand without inventory, or a restricted sale, stays out of stock', () => {
  assert.equal(classifyDetails(fx['index-controllers-us-high-demand-no-inventory']).status, 'out_of_stock');
  const restricted = classifyDetails(fx['frame-kit-us-restricted-high-demand']);
  assert.equal(restricted.status, 'out_of_stock');
  assert.equal(restricted.reason, 'Steam is not selling this item right now.');
});

test('a product takes the best status of its packages', () => {
  const pick = (...keys) => combineStatuses(keys.map((k) => classifyDetails(fx[k]))).status;
  assert.equal(pick('dock-us-out-of-stock', 'deck-us-in-stock'), 'in_stock');
  assert.equal(pick('frame-us-waitlist', 'controller-us-reservation-open'), 'reservation_open');
  assert.equal(pick('deck-jp-not-sold', 'dock-us-out-of-stock'), 'out_of_stock');
  assert.equal(combineStatuses([]).status, 'out_of_stock');
});

test('history records a transition when only the status changes', () => {
  const history = {};
  const base = { key: 'steam-controller:US', productId: 'steam-controller', productName: 'Steam Controller', region: 'US', source: 'steam' };
  assert.equal(mergeEvent(history, { ...base, available: false, status: 'out_of_stock', ts: '2026-10-13T10:00:00Z' }), true);
  assert.equal(mergeEvent(history, { ...base, available: false, status: 'reservation_open', ts: '2026-10-13T10:10:00Z' }), true);
  assert.equal(mergeEvent(history, { ...base, available: false, status: 'reservation_open', ts: '2026-10-13T10:20:00Z' }), false);
  assert.deepEqual(history[base.key].events[0], { ts: '2026-10-13T10:10:00Z', available: false, status: 'reservation_open' });
  assert.equal(history[base.key].status, 'reservation_open');
});

test('old events without a status still compare by availability', () => {
  const history = { k: { productId: 'p', region: 'US', source: 'steam', events: [{ ts: 't0', available: false }] } };
  assert.equal(mergeEvent(history, { key: 'k', productId: 'p', region: 'US', available: false, ts: 't1' }), false);
  assert.equal(mergeEvent(history, { key: 'k', productId: 'p', region: 'US', available: false, status: 'out_of_stock', ts: 't2' }), false);
  assert.equal(mergeEvent(history, { key: 'k', productId: 'p', region: 'US', available: false, status: 'reservation_open', ts: 't3' }), true);
});
