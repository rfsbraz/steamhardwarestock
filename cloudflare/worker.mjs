// Cloudflare Worker: runs the stock check on a cron and stores the results in
// KV. The Pages project serves dist/ and reads the same KV namespace through
// functions/. Bindings and secrets are set in wrangler.toml and with
// `wrangler secret put`; see docs/cloudflare.md.
import { checkAll } from '../lib/steam.mjs';
import { buildStatusDoc } from '../lib/status-doc.mjs';
import { mergeEvent } from '../lib/history-merge.mjs';

export const STATUS_KEY = 'status.json';
export const HISTORY_KEY = 'stock-history.json';
const HOOK_KEY = 'deploy-hook-last';
const INTERVAL_SECONDS = 600;
const HOOK_MIN_MS = 60 * 60 * 1000;

export async function runCheck(env, { fetchImpl = (...args) => fetch(...args), now = new Date() } = {}) {
  const kv = env.STOCK_KV;
  const { results, errors, fetchCount } = await checkAll({ fetchImpl });
  const ts = now.toISOString();
  await kv.put(STATUS_KEY, JSON.stringify(buildStatusDoc(results, { generatedAt: ts, intervalSeconds: INTERVAL_SECONDS })));

  // KV has no compare-and-swap. Only this cron writes history, so last write wins.
  const raw = await kv.get(HISTORY_KEY);
  const history = raw ? JSON.parse(raw) : {};
  let transitions = 0;
  for (const { product, region, available, status } of results) {
    const changed = mergeEvent(history, {
      key: `${product.id}:${region}`,
      productId: product.id,
      productName: product.name,
      region,
      source: 'steam',
      available,
      status,
      ts
    });
    if (changed) transitions++;
  }
  if (transitions > 0) {
    await kv.put(HISTORY_KEY, JSON.stringify(history));
    await maybeRebuild(env, fetchImpl, now);
  }
  console.log(`cron: ${fetchCount} Steam requests, ${results.length} results, ${errors.length} errors, ${transitions} transitions`);
  return { checked: results.length, errors: errors.length, transitions };
}

// The landing pages are static, so a status change triggers a Pages rebuild.
// At most one per hour keeps it inside the free build quota.
async function maybeRebuild(env, fetchImpl, now) {
  if (!env.PAGES_DEPLOY_HOOK) return;
  const last = Number(await env.STOCK_KV.get(HOOK_KEY)) || 0;
  if (now.getTime() - last < HOOK_MIN_MS) return;
  try {
    const res = await fetchImpl(env.PAGES_DEPLOY_HOOK, { method: 'POST' });
    if (res.ok) await env.STOCK_KV.put(HOOK_KEY, String(now.getTime()));
  } catch (error) {
    console.error('deploy hook error:', error?.message);
  }
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runCheck(env));
  }
};
