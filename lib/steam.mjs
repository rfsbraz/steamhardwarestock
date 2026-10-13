import { PRODUCTS, VALVE_SELLS, isCheckable } from './products.mjs';
import StockStatus from '../public/stock-status.js';

const { classifyDetails, combineStatuses, buttonFor, combineButtons } = StockStatus;

export const STEAM_API = 'https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/';
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY = 10;

export function isAvailable(d) {
  return classifyDetails(d).status === 'in_stock';
}

export function regionUrl(region, packageIds) {
  const input = { packageid: packageIds, context: { country_code: region, language: 'english' } };
  return `${STEAM_API}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
}

// One GetHardwareItems call per region, covering every packageId.
export async function fetchRegion(region, packageIds, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(regionUrl(region, packageIds), { signal: controller.signal });
    if (!res.ok) throw new Error(`steam ${res.status}`);
    const payload = await res.json();
    const byId = new Map();
    for (const d of payload?.response?.details || []) {
      if (d && d.packageid != null) byId.set(Number(d.packageid), d);
    }
    return byId;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAll({ products = PRODUCTS, regions = VALVE_SELLS, fetchImpl = fetch } = {}) {
  const checkable = products.filter(isCheckable);
  const packageIds = [...new Set(checkable.flatMap((p) => p.packageIds))];
  const results = [];
  const errors = [];
  let fetchCount = 0;

  for (let i = 0; i < regions.length; i += CONCURRENCY) {
    const batch = regions.slice(i, i + CONCURRENCY);
    fetchCount += batch.length;
    const settled = await Promise.allSettled(batch.map((region) => fetchRegion(region, packageIds, fetchImpl)));
    settled.forEach((s, j) => {
      const region = batch[j];
      for (const product of checkable) {
        if (s.status === 'fulfilled') {
          const details = product.packageIds.map((id) => s.value.get(id)).filter(Boolean);
          const packages = product.packageIds.map((id) => ({ id, ...classifyDetails(s.value.get(id)), button: buttonFor(s.value.get(id)) }));
          const combined = combineStatuses(packages);
          results.push({
            product,
            region,
            details,
            packages,
            status: combined.status,
            button: combineButtons(packages.map((p) => p.button)),
            estimate: combined.estimate,
            available: combined.status === 'in_stock'
          });
        } else {
          errors.push({ product: product.id, region, error: String(s.reason?.message || s.reason) });
        }
      }
    });
  }

  return { results, errors, total: checkable.length * regions.length, fetchCount };
}
