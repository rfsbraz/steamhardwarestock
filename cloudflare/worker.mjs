// Cloudflare Worker: runs the stock check on a cron and stores the results in
// KV. The Pages project serves dist/ and reads the same KV namespace through
// functions/. Bindings are in cloudflare/wrangler.toml. The GH_DISPATCH_TOKEN secret is set
// with `wrangler secret put`; see docs/cloudflare.md.
import { checkAll } from '../lib/steam.mjs';
import { buildStatusDoc } from '../lib/status-doc.mjs';
import { mergeEvent } from '../lib/history-merge.mjs';

export const STATUS_KEY = 'status.json';
export const HISTORY_KEY = 'stock-history.json';
const DISPATCH_KEY = 'dispatch-last';
const INTERVAL_SECONDS = 600;
const DISPATCH_MIN_MS = 10 * 60 * 1000;
const DISPATCH_URL = 'https://api.github.com/repos/rfsbraz/steamhardwarestock/actions/workflows/pages-deploy.yml/dispatches';

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
    await maybeDispatch(env, fetchImpl, now);
  }
  console.log(`cron: ${fetchCount} Steam requests, ${results.length} results, ${errors.length} errors, ${transitions} transitions`);
  return { checked: results.length, errors: errors.length, transitions };
}

// The landing pages are static, so a status change asks GitHub to run the
// Pages deploy workflow. At most one dispatch per 10 minutes. Without
// GH_DISPATCH_TOKEN this does nothing.
async function maybeDispatch(env, fetchImpl, now) {
  if (!env.GH_DISPATCH_TOKEN) return;
  const last = Number(await env.STOCK_KV.get(DISPATCH_KEY)) || 0;
  if (now.getTime() - last < DISPATCH_MIN_MS) return;
  try {
    const res = await fetchImpl(DISPATCH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'steamhardwarestock-cron',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({ ref: 'main' })
    });
    if (res.ok) {
      await env.STOCK_KV.put(DISPATCH_KEY, String(now.getTime()));
    } else {
      console.error('workflow dispatch failed:', res.status);
    }
  } catch (error) {
    console.error('workflow dispatch error:', error?.message);
  }
}

export default {
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runCheck(env));
  }
};
