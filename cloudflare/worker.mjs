// Cloudflare Worker: runs the stock check on a cron and stores the results in
// KV. The Pages project serves dist/ and reads the same KV namespace through
// functions/. Bindings are in cloudflare/wrangler.toml. The GH_DISPATCH_TOKEN secret is set
// with `wrangler secret put`; see docs/cloudflare.md.
import { fetchAnswers, classifyAnswers, CHECKED_REGIONS } from '../lib/steam.mjs';
import { buildStatusDoc, STATUS_RULES_VERSION } from '../lib/status-doc.mjs';
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
// the check time plus three fingerprints of the last full check, so a run
// never has to read a large value to know whether anything changed.
//   groups: regions whose Steam answers were byte-identical at the last full
//           check, with the SHA-256 of that answer (see quietPlan)
//   cursor: where the next quiet run continues its rotation
//   body:   SHA-256 of the status-body text (only the fields the site uses)
//   states: SHA-256 of each product and region's status, which is all
//           history records
//   rules:  STATUS_RULES_VERSION that built the body
// functions/status.json.js reads only generatedAt from it.
export const STATUS_BODY_KEY = 'status-body';
export const STATUS_META_KEY = 'status-meta';
export const LEGACY_STATUS_KEY = 'status.json';
export const HISTORY_KEY = 'stock-history.json';
const DISPATCH_KEY = 'dispatch-last';
const INTERVAL_SECONDS = 600;
const DISPATCH_MIN_MS = 10 * 60 * 1000;
const DISPATCH_URL = 'https://api.github.com/repos/rfsbraz/steamhardwarestock/actions/workflows/pages-deploy.yml/dispatches';

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (data) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));

// Most of a run's CPU is the Steam subrequests themselves (about 0.4 ms
// each in workerd), not our parsing. Many countries get byte-identical
// answers (the EU countries share one), so after a full check the regions
// are grouped by answer. A quiet run then fetches one region per group plus
// ROTATE_PER_RUN others in turn, so every region is still fetched at least
// once every few runs. Any answer that differs from its group, or any failed
// request, turns the run into a full check of every region.
export const ROTATE_PER_RUN = 3;

// Regions to fetch on a quiet run: the first region of each group, then the
// next ROTATE_PER_RUN of the rest, starting at cursor.
export function quietPlan(groups, cursor, all) {
  const leaders = groups.map((g) => g.regions[0]);
  const lead = new Set(leaders);
  const rest = all.filter((r) => !lead.has(r));
  const turn = [];
  for (let i = 0; i < Math.min(ROTATE_PER_RUN, rest.length); i++) turn.push(rest[(cursor + i) % rest.length]);
  return { regions: [...leaders, ...turn], next: rest.length ? (cursor + turn.length) % rest.length : 0 };
}

function groupsFrom(regions, hashes) {
  const byHash = new Map();
  regions.forEach((r, i) => {
    if (!byHash.has(hashes[i])) byHash.set(hashes[i], []);
    byHash.get(hashes[i]).push(r);
  });
  return [...byHash].map(([h, rs]) => ({ h, regions: rs }));
}

const quietUsable = (prev, all) => {
  if (!Array.isArray(prev.groups) || !prev.body || prev.rules !== STATUS_RULES_VERSION) return false;
  const seen = prev.groups.flatMap((g) => g.regions);
  return seen.length === all.length && all.every((r) => seen.includes(r));
};

export async function runCheck(env, { fetchImpl = (...args) => fetch(...args), now = new Date(), regions } = {}) {
  const kv = env.STOCK_KV;
  const all = regions || CHECKED_REGIONS;
  const ts = now.toISOString();
  const prev = readMeta(await kv.get(STATUS_META_KEY)) || {};
  const writeMeta = (fp) => kv.put(STATUS_META_KEY, JSON.stringify({ generatedAt: ts, ...fp }));
  let fetchCount = 0;
  const answerOf = new Map();
  const hashOf = new Map();
  const fetchSome = async (list) => {
    const got = await fetchAnswers({ fetchImpl, bytes: true, regions: list });
    fetchCount += got.fetchCount;
    const hashes = await Promise.all(got.answers.map((a) => (a == null ? null : sha256(a))));
    list.forEach((r, i) => {
      answerOf.set(r, got.answers[i]);
      hashOf.set(r, hashes[i]);
    });
    return got.failures.length === 0;
  };

  // Quiet run: every fetched answer matches its group from the last full
  // check, so nothing is decoded, parsed, built or read from KV.
  if (quietUsable(prev, all)) {
    const plan = quietPlan(prev.groups, prev.cursor || 0, all);
    const groupHash = new Map(prev.groups.flatMap((g) => g.regions.map((r) => [r, g.h])));
    const ok = await fetchSome(plan.regions);
    if (ok && plan.regions.every((r) => hashOf.get(r) === groupHash.get(r))) {
      const { generatedAt: _old, ...kept } = prev;
      await writeMeta({ ...kept, cursor: plan.next });
      console.log(`cron: ${fetchCount} Steam requests, same answers as last run`);
      return { checked: plan.regions.length, errors: 0, transitions: 0, unchanged: true, fetchCount };
    }
  }

  // Full check. Answers already fetched above are reused.
  const missing = all.filter((r) => !answerOf.has(r) || answerOf.get(r) == null);
  if (missing.length) await fetchSome(missing);
  const dec = new TextDecoder();
  const answers = all.map((r) => (answerOf.get(r) == null ? null : dec.decode(answerOf.get(r))));
  const { results, errors } = classifyAnswers({ regions: all, answers });
  const { generatedAt: _, ...doc } = buildStatusDoc(results, { generatedAt: ts, intervalSeconds: INTERVAL_SECONDS, ...(regions ? { regions } : {}) });
  const body = JSON.stringify(doc);
  const statesText = results.map((r) => `${r.product.id}:${r.region}=${r.status}`).join('\n');
  const [bodyFp, statesFp] = await Promise.all([sha256(body), sha256(statesText)]);
  const sameRules = prev.rules === STATUS_RULES_VERSION;
  const bodyChanged = !sameRules || bodyFp !== prev.body;
  if (bodyChanged) await kv.put(STATUS_BODY_KEY, body);

  // History only records statuses. If none moved, it is not read or parsed.
  // KV has no compare-and-swap. Only this cron writes history, so last write
  // wins.
  let transitions = 0;
  if (statesFp !== prev.states) {
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
  }
  // A run with a failed region stores no groups, so the next run is full too.
  const failed = all.some((r) => answerOf.get(r) == null);
  const groups = failed ? undefined : groupsFrom(all, all.map((r) => hashOf.get(r)));
  // The meta goes last, so a run that fails halfway is done in full again.
  await writeMeta({ body: bodyFp, states: statesFp, rules: STATUS_RULES_VERSION, groups, cursor: 0 });
  console.log(`cron: ${fetchCount} Steam requests, ${results.length} results, ${errors.length} errors, ${bodyChanged ? 'body rewritten' : 'same body'}, ${transitions} transitions`);
  return { checked: results.length, errors: errors.length, transitions, fetchCount };
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
