import { PRODUCTS, VALVE_SELLS } from './products.mjs';

// Steam's GetItems returns a formatted price and cents, but no currency code.
// Each Valve region has one store currency; a formatted price that does not
// match it is dropped, so no offer ever carries a guessed currency.
const NON_EUR = { US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', PL: 'PLN' };
export function currencyFor(cc) {
  return NON_EUR[cc] || (VALVE_SELLS.includes(cc) ? 'EUR' : null);
}

const SHAPES = {
  USD: /^\$\d/,
  CAD: /^C\$ ?\d/,
  GBP: /^£\d/,
  AUD: /^A\$ ?\d/,
  PLN: /^\d[\d\s.,]*zł$/,
  EUR: /^\d[\d\s.,]*€$/
};

export function parsePrice(cc, option) {
  const currency = currencyFor(cc);
  const formatted = option?.formatted_final_price;
  const cents = Number(option?.final_price_in_cents);
  if (!currency || !formatted || !(cents > 0)) return null;
  if (!SHAPES[currency].test(formatted.trim())) return null;
  const price = { amount: cents / 100, currency, formatted: formatted.trim() };
  // A discount is kept only when Steam gives the percentage and an original
  // price above the final one, in the same currency format.
  const pct = Number(option.discount_pct);
  const original = Number(option.original_price_in_cents);
  const formattedOriginal = option.formatted_original_price?.trim();
  if (pct > 0 && original > cents && formattedOriginal && SHAPES[currency].test(formattedOriginal)) {
    price.discountPct = pct;
    price.formattedOriginal = formattedOriginal;
  }
  return price;
}

function itemsUrl(cc, ids) {
  const input = {
    ids: ids.map((packageid) => ({ packageid })),
    context: { country_code: cc, language: 'english' },
    data_request: { include_all_purchase_options: true, include_basic_info: true }
  };
  return `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`;
}

// { [packageId]: { [cc]: { amount, currency, formatted } } }, one request per region.
export async function fetchPrices({ fetchImpl = (...a) => fetch(...a), regions = VALVE_SELLS } = {}) {
  const ids = PRODUCTS.flatMap((p) => p.packages.map((pk) => pk.id));
  const prices = {};
  await Promise.all(regions.map(async (cc) => {
    try {
      const res = await fetchImpl(itemsUrl(cc, ids));
      if (!res.ok) return;
      const json = await res.json();
      for (const item of json?.response?.store_items || []) {
        const price = parsePrice(cc, item.best_purchase_option);
        if (price) (prices[item.id] ||= {})[cc] = price;
      }
    } catch (error) {
      console.warn(`prices: ${cc} failed:`, error?.message);
    }
  }));
  return prices;
}
