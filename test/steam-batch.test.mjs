import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, REGIONS, VALVE_SELLS, isCheckable } from '../lib/products.mjs';
import { checkAll } from '../lib/steam.mjs';

function fakeFetch(calls, detailsFor) {
  return async (url) => {
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    calls.push(input);
    // Steam does not promise any order, so return the details reversed.
    const details = input.packageid.map((id) => detailsFor(id, input.context.country_code)).reverse();
    return new Response(JSON.stringify({ response: { details } }), { status: 200 });
  };
}

const inStock = (packageid) => ({
  packageid,
  inventory_available: true,
  allow_purchase_in_country: true,
  account_restricted_from_purchasing: false,
  requires_reservation: false,
  high_pending_orders: false
});

test('sends one request per region with every checkable packageId', async () => {
  const calls = [];
  const { fetchCount } = await checkAll({ fetchImpl: fakeFetch(calls, inStock) });
  const allIds = PRODUCTS.filter(isCheckable).flatMap((p) => p.packageIds).sort();
  assert.equal(calls.length, VALVE_SELLS.length);
  assert.equal(fetchCount, VALVE_SELLS.length);
  assert.ok(fetchCount < 50, `fetch count ${fetchCount} must stay under 50`);
  for (const input of calls) {
    assert.deepEqual([...input.packageid].sort(), allIds);
  }
  assert.deepEqual(calls.map((c) => c.context.country_code).sort(), [...VALVE_SELLS].sort());
});

test('only checks regions Valve sells hardware in', () => {
  const codes = new Set(REGIONS.map((r) => r.code));
  for (const code of VALVE_SELLS) assert.ok(codes.has(code), `${code} is not a known region`);
  for (const code of ['JP', 'KR', 'HK', 'TW', 'BR', 'CH', 'NO']) {
    assert.ok(!VALVE_SELLS.includes(code), `${code} should not be checked on Steam`);
  }
});

test('maps details back to the right product by packageid', async () => {
  const dockId = PRODUCTS.find((p) => p.id === 'steam-dock').packageIds[0];
  const detailsFor = (id) => (id === dockId ? { ...inStock(id), inventory_available: false } : inStock(id));
  const { results } = await checkAll({ fetchImpl: fakeFetch([], detailsFor), regions: ['US'] });
  const byId = Object.fromEntries(results.map((r) => [r.product.id, r.available]));
  assert.equal(byId['steam-dock'], false);
  assert.equal(byId['steam-deck'], true);
});

test('a failed region is reported as an error for each product, not a result', async () => {
  const fetchImpl = async () => new Response('nope', { status: 500 });
  const { results, errors } = await checkAll({ fetchImpl, regions: ['US', 'GB'] });
  assert.equal(results.length, 0);
  assert.equal(errors.length, 2 * PRODUCTS.filter(isCheckable).length);
});
