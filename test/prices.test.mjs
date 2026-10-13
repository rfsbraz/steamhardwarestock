import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, currencyFor, fetchPrices } from '../lib/prices.mjs';

test('maps each Valve region to its store currency', () => {
  assert.equal(currencyFor('US'), 'USD');
  assert.equal(currencyFor('PL'), 'PLN');
  assert.equal(currencyFor('DE'), 'EUR');
  assert.equal(currencyFor('NO'), null);
});

test('keeps a price only when the formatted string matches the currency', () => {
  assert.deepEqual(parsePrice('DE', { formatted_final_price: '779,00€', final_price_in_cents: '77900' }), { amount: 779, currency: 'EUR', formatted: '779,00€' });
  assert.deepEqual(parsePrice('CA', { formatted_final_price: 'C$ 1,129.00', final_price_in_cents: '112900' }), { amount: 1129, currency: 'CAD', formatted: 'C$ 1,129.00' });
  assert.equal(parsePrice('DE', { formatted_final_price: '$789.00', final_price_in_cents: '78900' }), null);
  assert.equal(parsePrice('US', { formatted_final_price: '$0.00', final_price_in_cents: '0' }), null);
  assert.equal(parsePrice('US', undefined), null);
});

test('fetchPrices makes one request per region and skips failures', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const cc = JSON.parse(new URL(url).searchParams.get('input_json')).context.country_code;
    calls.push(cc);
    if (cc === 'GB') return new Response('no', { status: 500 });
    return new Response(JSON.stringify({ response: { store_items: [{ id: 946113, best_purchase_option: { formatted_final_price: '$789.00', final_price_in_cents: '78900' } }] } }));
  };
  const prices = await fetchPrices({ fetchImpl, regions: ['US', 'GB'] });
  assert.deepEqual(calls.sort(), ['GB', 'US']);
  assert.deepEqual(prices, { 946113: { US: { amount: 789, currency: 'USD', formatted: '$789.00' } } });
});
