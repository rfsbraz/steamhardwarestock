# Cloudflare hosting

The site runs on Cloudflare. Vercel hosting was removed in October 2026.

- **Pages** (`wrangler.toml`, project `steamhardwarestock`, direct upload, https://steamhardwarestock.pages.dev) serves `dist/` and three functions: `/status.json`, `/api/history` and `/proxy` (Komodo only).
- **Worker** (`cloudflare/worker.mjs`, `cloudflare/wrangler.toml`) runs the stock check every 10 minutes. It writes `status.json` and `stock-history.json` to KV.
- Both bind the KV namespace `STOCK_KV` (id `ef31e7789d0949b987f9814a86ed0fce`, set in both `wrangler.toml` files).
- **Rebuilds:** the landing pages are static. When a status changes, the Worker sends a GitHub `workflow_dispatch` for `pages-deploy.yml` on `main`, at most once per 10 minutes (the last dispatch time is kept in KV). Without `GH_DISPATCH_TOKEN` it skips this quietly. A failed dispatch is logged and retried on the next change.

- **Notifications** (`lib/notify.mjs`): when a status changes, the Worker posts one Discord message and one ntfy.sh message per run, listing every change from that run (cut at 2000 characters with a count of the rest). The first event for a product and country only seeds history and is not posted. Each channel is skipped quietly when its secret is missing. A failed post logs only the channel and HTTP status, never the URL or topic, and does not stop the run. To turn a channel off, `npx wrangler secret delete <NAME> --config cloudflare/wrangler.toml`.

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
| `DISCORD_WEBHOOK_URL` | Worker secret: `npx wrangler secret put DISCORD_WEBHOOK_URL --config cloudflare/wrangler.toml` | Optional. Channel settings, Integrations, Webhooks, New Webhook, Copy Webhook URL |
| `NTFY_TOPIC` | Worker secret: `npx wrangler secret put NTFY_TOPIC --config cloudflare/wrangler.toml` | Optional. A topic name on ntfy.sh. Anyone who knows it can subscribe, so pick one that is hard to guess, or a public name if the feed is meant to be public |

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
