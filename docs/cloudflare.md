# Cloudflare hosting

The site can run on Cloudflare next to Vercel.

- **Pages** (`wrangler.toml`, project `steamhardwarestock`, direct upload, https://steamhardwarestock.pages.dev) serves `dist/` and three functions: `/status.json`, `/api/history` and `/proxy` (Komodo only).
- **Worker** (`cloudflare/worker.mjs`, `cloudflare/wrangler.toml`) runs the stock check every 10 minutes. It writes `status.json` and `stock-history.json` to KV.
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
- **Cloudflare Web Analytics** beacon (`static.cloudflareinsights.com/beacon.min.js`, public token `9f338d544ab84bbc920053a6f6cf222e`). It is a manual snippet because direct upload projects do not get the automatic one. It also counts visits while the site is still on Vercel. Leave automatic injection off in the dashboard, or pages count twice.
- **Vercel Analytics** only works on Vercel. On Pages, `/_vercel/insights/script.js` returns 404, which is harmless.

## Parallel run and cutover

1. Run both deploy workflows once by hand and leave Vercel as is. Run them side by side for at least 48 hours.
2. Compare `https://steamhardwarestock.pages.dev/status.json` with the Vercel `/status.json`. The `regions` and `cells` should match, and `generatedAt` should move every 10 minutes.
3. Check the Worker logs: 31 Steam requests per run and no errors.
4. Only then point DNS at Pages. Keep the Vercel project for a quick rollback, then turn off its cron.
