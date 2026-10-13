// Shared by the Vercel cron and the Cloudflare Worker. No storage imports here.
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
