import { PRODUCTS, VALVE_SELLS, isCheckable } from './products.mjs';
import StockStatus from '../public/stock-status.js';

const { classifyDetails, combineStatuses, buttonFor, combineButtons } = StockStatus;

export const STEAM_API = 'https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/';
const FETCH_TIMEOUT_MS = 8000;
const CONCURRENCY = 10;

// The Steam countries the checker polls. Pages that state a count use this.
export const CHECKED_REGIONS = VALVE_SELLS;

export function isAvailable(d) {
  return classifyDetails(d).status === 'in_stock';
}

export function regionUrl(region, packageIds) {
  const input = { packageid: packageIds, context: { country_code: region, language: 'english' } };
  return `${STEAM_API}?input_json=${encodeURIComponent(JSON.stringify(input))}`;
}

// One GetHardwareItems call per region, covering every packageId. Returns the
// body as text so the Worker can compare it with the last run before parsing.
export async function fetchRegionText(region, packageIds, fetchImpl = fetch, { bytes = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(regionUrl(region, packageIds), { signal: controller.signal });
    if (!res.ok) throw new Error(`steam ${res.status}`);
    // bytes: the Worker hashes the raw body and only decodes it to a string
    // when the hash differs from the last run.
    return bytes ? new Uint8Array(await res.arrayBuffer()) : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseRegion(text) {
  const payload = JSON.parse(text);
  const byId = new Map();
  for (const d of payload?.response?.details || []) {
    if (d && d.packageid != null) byId.set(Number(d.packageid), d);
  }
  return byId;
}

export async function fetchRegion(region, packageIds, fetchImpl = fetch) {
  return parseRegion(await fetchRegionText(region, packageIds, fetchImpl));
}

const checkableOf = (products) => products.filter(isCheckable);

// Fetches every region and keeps the raw answers. answers[i] is the text for
// regions[i], or null when that request failed (its reason is in failures).
// With bytes: true each answer is a Uint8Array instead of a string.
export async function fetchAnswers({ products = PRODUCTS, regions = CHECKED_REGIONS, fetchImpl = fetch, bytes = false } = {}) {
  const packageIds = [...new Set(checkableOf(products).flatMap((p) => p.packageIds))];
  const answers = [];
  const failures = [];
  let fetchCount = 0;
  for (let i = 0; i < regions.length; i += CONCURRENCY) {
    const batch = regions.slice(i, i + CONCURRENCY);
    fetchCount += batch.length;
    const settled = await Promise.allSettled(batch.map((region) => fetchRegionText(region, packageIds, fetchImpl, { bytes })));
    settled.forEach((s, j) => {
      answers.push(s.status === 'fulfilled' ? s.value : null);
      if (s.status !== 'fulfilled') failures.push({ region: batch[j], error: String(s.reason?.message || s.reason) });
    });
  }
  return { regions, answers, failures, fetchCount };
}

// Turns raw answers into one result per product and region.
export function classifyAnswers({ regions, answers }, { products = PRODUCTS } = {}) {
  const checkable = checkableOf(products);
  const results = [];
  const errors = [];
  regions.forEach((region, i) => {
    let byId = null;
    let error = null;
    if (answers[i] == null) error = 'request failed';
    else {
      try {
        byId = parseRegion(answers[i]);
      } catch (e) {
        error = String(e?.message || e);
      }
    }
    for (const product of checkable) {
      if (!byId) {
        errors.push({ product: product.id, region, error });
        continue;
      }
      const details = product.packageIds.map((id) => byId.get(id)).filter(Boolean);
      const packages = product.packageIds.map((id) => ({ id, ...classifyDetails(byId.get(id)), button: buttonFor(byId.get(id)) }));
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
    }
  });
  return { results, errors };
}

export async function checkAll({ products = PRODUCTS, regions = CHECKED_REGIONS, fetchImpl = fetch } = {}) {
  const fetched = await fetchAnswers({ products, regions, fetchImpl });
  const { results, errors } = classifyAnswers(fetched, { products });
  const reasons = new Map(fetched.failures.map((f) => [f.region, f.error]));
  for (const e of errors) if (reasons.has(e.region)) e.error = reasons.get(e.region);
  return { results, errors, total: checkableOf(products).length * regions.length, fetchCount: fetched.fetchCount };
}
