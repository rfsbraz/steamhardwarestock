# Cloudflare hosting

The site runs on Cloudflare. Vercel hosting was removed in October 2026.

- **Pages** (`wrangler.toml`, project `steamhardwarestock`, direct upload, https://steamhardwarestock.pages.dev) serves `dist/` and these functions: `/status.json`, `/api/history`, `/feed.xml` (Atom), `/rss.xml` and `/proxy` (Komodo only).
- **Feeds** (`lib/feed.mjs`, `functions/_feed.js`) list the latest 50 stock changes from `stock-history.json`. They only read KV, once per 10 minutes at most per edge location, because the XML is kept in `caches.default` with `s-maxage=600`.
- **Worker** (`cloudflare/worker.mjs`, `cloudflare/wrangler.toml`) runs the stock check every 10 minutes. It writes the status and `stock-history.json` to KV. See [Worker CPU and KV keys](#worker-cpu-and-kv-keys).
- Both bind the KV namespace `STOCK_KV` (id `ef31e7789d0949b987f9814a86ed0fce`, set in both `wrangler.toml` files).
- **Rebuilds:** the landing pages are static. When a status changes, the Worker sends a GitHub `workflow_dispatch` for `pages-deploy.yml` on `main`, at most once per 10 minutes (the last dispatch time is kept in KV). Without `GH_DISPATCH_TOKEN` it skips this quietly. A failed dispatch is logged and retried on the next change.

## Deploys

| Workflow | Runs on | Does |
| --- | --- | --- |
| `.github/workflows/pages-deploy.yml` | `workflow_dispatch` (from the Worker or by hand), push to `main` | `npm run build` with `CF_PAGES=1` and `PRERENDER_SOURCE_URL=https://steamhardwarestock.pages.dev`, then `wrangler pages deploy dist --project-name steamhardwarestock` |
| `.github/workflows/worker-deploy.yml` | push to `main` touching `cloudflare/**`, `lib/**`, `public/stock-status.js` or `package-lock.json`; `workflow_dispatch` | `wrangler deploy --config cloudflare/wrangler.toml` |

`wrangler pages deploy` runs from the repo root, so it also uploads `functions/` and reads the KV binding from `wrangler.toml`.

## Secrets

| Secret | Where | Notes |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Workers Scripts:Edit, Workers KV Storage:Edit, Cloudflare Pages:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | |
| `GH_DISPATCH_TOKEN` | Worker secret: `npx wrangler secret put GH_DISPATCH_TOKEN --config cloudflare/wrangler.toml` | Fine-grained GitHub token, this repo only, Actions: write |

Never commit them. For `wrangler dev`, copy `cloudflare/.dev.vars.example` to `cloudflare/.dev.vars`.

DNS access to the domain is only needed for the cutover.

## Analytics

All tags come from `lib/analytics.mjs` and go into every built page. `test/analytics.test.mjs` checks for them.

- **GA** (`G-D4LRTXD5LR`).
- **Cloudflare Web Analytics** beacon (`static.cloudflareinsights.com/beacon.min.js`, public token `9f338d544ab84bbc920053a6f6cf222e`). It is a manual snippet because direct upload projects do not get the automatic one. Leave automatic injection off in the dashboard, or pages count twice.

## Importing the old Blob history

`scripts/import-blob-history.mjs` is a one-off. It merges an old Vercel Blob `stock-history.json` export into the KV `stock-history.json`. Events from both sides are combined through `mergeHistories` in `lib/history-merge.mjs`, which drops duplicates, sorts them and keeps the newest 50 per product and region. Running it twice with the same export changes nothing.

It needs Node 22 for wrangler 4 and a logged in wrangler (`wrangler login` or `CLOUDFLARE_API_TOKEN`). The namespace id comes from `wrangler.toml`.

```sh
# Dry run: reads KV, prints key and event counts, writes nothing.
node scripts/import-blob-history.mjs ~/stock-history.blob.json

# Write. Saves the current KV value to backups/kv-stock-history-<time>.json first.
node scripts/import-blob-history.mjs ~/stock-history.blob.json --apply
```

With `--apply` it reads KV again right before the write and stops if the Worker changed it in the meantime. Run it again in that case. `backups/` is ignored by git. To roll back, put the backup file with `wrangler kv key put stock-history.json --path <backup> --namespace-id <id> --remote`.

## Worker CPU and KV keys

The free plan allows 10 ms of CPU per cron run. Measured in workerd, most of a run's CPU is the Steam subrequests themselves, about 0.4 ms each. Parsing answers, building the document and the KV calls add little on a run where nothing changed. So the Worker keeps quiet runs to a few requests and never reads a large KV value on them.

| Key | Written | Holds |
|---|---|---|
| `status-meta` | every run | `generatedAt` plus the fingerprints below, under 1 KB |
| `status-body` | when the document changes | the status document without `generatedAt` |
| `stock-history.json` | when a status changes | the history, as before |
| `steam-raw`, `status.json` | no longer written | old keys, safe to delete by hand |

`status-meta` holds:

- `groups`: the regions whose Steam answers were byte-identical at the last full check, with the SHA-256 of that answer. Today that is about five groups (the US and Canada, the UK and Ireland, Australia, Spain, the other EU countries).
- `cursor`: where the next quiet run continues its rotation.
- `body`: the SHA-256 of `status-body`, which keeps only the fields the site uses.
- `states`: the SHA-256 of every product and region status, which is all the history records.
- `rules`: `STATUS_RULES_VERSION` from `lib/status-doc.mjs`. Bump it when the status, button or estimate rules change, so the first run after the deploy rebuilds the document even if Steam answers the same.

A quiet run fetches the first region of each group plus `ROTATE_PER_RUN` (3) other regions in turn, about 8 requests instead of 31. If every answer matches its group, it writes `status-meta` and stops. Nothing is decoded, parsed or built, and no large key is read.

Anything else is a full check of all 31 regions: an answer that differs from its group, a failed request, missing or old fingerprints, or new rules. A full check builds the document and writes `status-body` only if its fingerprint changed. It reads and parses the history only if a status changed. `status-meta` is written last, so a run that fails halfway is redone in full.

The trade-off: a change that shows up in only one region, and not in the first region of its group, is seen when the rotation reaches that region. With 31 regions and about 5 groups that is at most 9 runs, 90 minutes. A change in a group's first region, or one that hits a whole group, is seen on the next run. Raise `ROTATE_PER_RUN` in `cloudflare/worker.mjs` to shorten that, at about 0.4 ms per extra request.

`functions/status.json.js` joins `status-meta` and `status-body` as text, without parsing the large body.

### Measuring

`--capture` only reads: the Steam API and the public `/status.json` and `/api/history`.

```bash
node scripts/bench-worker.mjs --capture
node scripts/bench-worker.mjs                  # cold and warm, no change and with a change
node scripts/bench-worker.mjs --worker /path/to/other/worker.mjs   # compare
```

`bench-worker.mjs` replays Steam from the capture in Node, so it shows our own JavaScript work but not the cost of the subrequests. `bench-workerd.mjs` runs the Worker in workerd with live Steam requests and a local KV. It never deploys and never touches production KV.

```bash
npm i --no-save miniflare@3
node scripts/bench-workerd.mjs                 # quiet runs
node scripts/bench-workerd.mjs --full          # full checks
```

Production CPU time is in the Workers analytics (`workersInvocationsAdaptive`, `cpuTime`). KV writes per hour are in `kvOperationsAdaptiveGroups`.
