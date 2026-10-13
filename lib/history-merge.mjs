// Used by the Cloudflare Worker and scripts/import-blob-history.mjs. No storage imports here.
const MAX_EVENTS_PER_KEY = 50;

export function mergeEvent(history, event) {
  const { key, productId, productName, region, source, available, status, ts } = event;
  const entry = history[key] || {
    productId,
    productName,
    region,
    source: source || 'steam',
    events: []
  };

  const last = entry.events[0];
  // Events written before statuses existed only carry `available`.
  const lastStatus = last ? last.status || (last.available ? 'in_stock' : 'out_of_stock') : null;
  const sameStatus = !status || lastStatus === status;
  if (last && last.available === available && sameStatus) {
    return false;
  }

  if (available) {
    entry.lastInStock = ts;
  } else {
    entry.lastOutOfStock = ts;
  }

  entry.events.unshift(status ? { ts, available, status } : { ts, available });
  if (status) entry.status = status;
  if (entry.events.length > MAX_EVENTS_PER_KEY) {
    entry.events.length = MAX_EVENTS_PER_KEY;
  }

  history[key] = entry;
  return true;
}

const eventKey = (e) => `${Date.parse(e.ts)}|${e.available}|${e.status || ''}`;

// Merges two history documents into a new one. Events from both sides are
// sorted oldest first, exact duplicates dropped, and then replayed through
// mergeEvent so the result follows the same rules as live writes.
export function mergeHistories(base, incoming) {
  const merged = {};
  const stats = { kvKeys: 0, blobKeys: 0, mergedKeys: 0, newKeys: 0, kvEvents: 0, blobEvents: 0, mergedEvents: 0, addedEvents: 0 };
  const keys = new Set([...Object.keys(base), ...Object.keys(incoming)]);
  for (const key of keys) {
    const a = base[key];
    const b = incoming[key];
    if (a) { stats.kvKeys++; stats.kvEvents += a.events?.length || 0; }
    if (b) { stats.blobKeys++; stats.blobEvents += b.events?.length || 0; }
    if (!a) stats.newKeys++;
    const meta = a || b;
    const seen = new Set();
    const events = [...(a?.events || []), ...(b?.events || [])]
      .filter((e) => e && e.ts && !Number.isNaN(Date.parse(e.ts)))
      .filter((e) => (seen.has(eventKey(e)) ? false : seen.add(eventKey(e))))
      .sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));
    merged[key] = {
      productId: meta.productId,
      productName: meta.productName,
      region: meta.region,
      source: meta.source || 'steam',
      events: []
    };
    for (const e of events) mergeEvent(merged, { key, ...e });
    stats.mergedEvents += merged[key].events.length;
  }
  stats.mergedKeys = Object.keys(merged).length;
  stats.addedEvents = stats.mergedEvents - stats.kvEvents;
  return { merged, stats };
}
