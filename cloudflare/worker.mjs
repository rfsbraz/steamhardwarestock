// Cloudflare Worker: runs the stock check on a cron and stores the results in
// KV. The Pages project serves dist/ and reads the same KV namespace through
// functions/. Bindings are in cloudflare/wrangler.toml. The GH_DISPATCH_TOKEN secret is set
// with `wrangler secret put`; see docs/cloudflare.md.
import { fetchAnswers, classifyAnswers } from '../lib/steam.mjs';
import { buildStatusDoc } from '../lib/status-doc.mjs';
import { mergeEvent } from '../lib/history-merge.mjs';

function readMeta(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// The status document is split so a run with no change stays cheap.
// STATUS_BODY_KEY holds the document without generatedAt and is only
// rewritten when it changes. STATUS_META_KEY is small and written every run:
// just the check time. functions/status.json.js joins them.
// LEGACY_STATUS_KEY is the old single key, still read by Pages until the
// Worker has written the new keys once.
export const STATUS_BODY_KEY = 'status-body';
export const STATUS_META_KEY = 'status-meta';
export const LEGACY_STATUS_KEY = 'status.json';
export const HISTORY_KEY = 'stock-history.json';
// The raw Steam answers from the last run that changed anything. When every
// region answers with the same text, nothing is parsed or rebuilt.
export const STEAM_RAW_KEY = 'steam-raw';
const DISPATCH_KEY = 'dispatch-last';
const INTERVAL_SECONDS = 600;
const DISPATCH_MIN_MS = 10 * 60 * 1000;
const DISPATCH_URL = 'https://api.github.com/repos/rfsbraz/steamhardwarestock/actions/workflows/pages-deploy.yml/dispatches';

export async function runCheck(env, { fetchImpl = (...args) => fetch(...args), now = new Date(), regions } = {}) {
  const kv = env.STOCK_KV;
  const fetched = await fetchAnswers({ fetchImpl, ...(regions ? { regions } : {}) });
  const { fetchCount } = fetched;
  const ts = now.toISOString();
  const meta = JSON.stringify({ generatedAt: ts });
  const raw = fetched.failures.length ? null : fetched.regions.map((r, i) => `${r}\t${fetched.answers[i]}`).join('\n');
  const [previousRaw, previousMeta] = await Promise.all([kv.get(STEAM_RAW_KEY), kv.get(STATUS_META_KEY)]);
  if (raw !== null && raw === previousRaw && readMeta(previousMeta)) {
    await kv.put(STATUS_META_KEY, meta);
    console.log(`cron: ${fetchCount} Steam requests, same answers as last run`);
    return { checked: fetched.regions.length, errors: 0, transitions: 0, unchanged: true };
  }

  const { results, errors } = classifyAnswers(fetched);
  const { generatedAt: _, ...doc } = buildStatusDoc(results, { generatedAt: ts, intervalSeconds: INTERVAL_SECONDS, ...(regions ? { regions } : {}) });
  const body = JSON.stringify(doc);
  const previousBody = await kv.get(STATUS_BODY_KEY);
  const bodyChanged = previousBody !== body;
  if (bodyChanged) await kv.put(STATUS_BODY_KEY, body);
  await kv.put(STATUS_META_KEY, meta);
  // Same body means every status is the same as last run, so history cannot
  // change. Skip reading and parsing it. KV has no compare-and-swap. Only this
  // cron writes history, so last write wins.
  let transitions = 0;
  // The raw answers are saved after everything else, so a run that fails
  // halfway is done in full again next time.
  const saveRaw = () => (raw !== previousRaw ? kv.put(STEAM_RAW_KEY, raw ?? '') : null);
  if (!bodyChanged) {
    await saveRaw();
    console.log(`cron: ${fetchCount} Steam requests, ${results.length} results, ${errors.length} errors, no change`);
    return { checked: results.length, errors: errors.length, transitions };
  }
  const historyText = await kv.get(HISTORY_KEY);
  const history = historyText ? JSON.parse(historyText) : {};
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
  await saveRaw();
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
