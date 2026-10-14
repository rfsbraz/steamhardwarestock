import { VALVE_SELLS } from './products.mjs';

// Fields from GetHardwareItems that the site reads. Everything else is dropped
// to keep status.json small.
// Bump when the rules that turn Steam answers into the document change
// (statuses, buttons, estimates, fields kept). The cron compares it with the
// last run, so a deploy with new rules rebuilds the document even when Steam
// answers exactly as before. 2: buttons added in #27.
export const STATUS_RULES_VERSION = 2;

export const STATUS_FIELDS = [
  'packageid',
  'inventory_available',
  'allow_purchase_in_country',
  'high_pending_orders',
  'requires_reservation',
  'account_restricted_from_purchasing',
  'reservation_not_allowed',
  'position_is_waitlist',
  'queue_in_waitlist',
  'rtime_estimated_notification',
  'estimated_delivery_soonest_business_days',
  'estimated_delivery_latest_business_days'
];

export function pickDetails(details) {
  if (!details) return null;
  const out = {};
  for (const key of STATUS_FIELDS) {
    if (details[key] !== undefined) out[key] = details[key];
  }
  return out;
}

// One document with every product x region, written by the cron and read by
// every open tab.
export function buildStatusDoc(results, { generatedAt, intervalSeconds, regions = VALVE_SELLS }) {
  const products = {};
  for (const r of results) {
    const byRegion = products[r.product.id] || (products[r.product.id] = {});
    const detailsById = new Map(r.details.map((d) => [Number(d.packageid), d]));
    byRegion[r.region] = {
      status: r.status,
      button: r.button || null,
      estimate: r.estimate || null,
      packages: r.packages.map((p) => ({
        id: p.id,
        status: p.status,
        button: p.button || null,
        estimate: p.estimate || null,
        details: pickDetails(detailsById.get(p.id))
      }))
    };
  }
  return { version: 1, generatedAt, intervalSeconds, regions, products };
}
