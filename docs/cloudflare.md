# Cloudflare hosting

The site can run on Cloudflare next to Vercel. Nothing here is deployed yet.

- **Pages** (`wrangler.toml`) serves `dist/` and three functions: `/status.json`, `/api/history` and `/proxy` (Komodo only).
- **Worker** (`cloudflare/worker.mjs`, `cloudflare/wrangler.toml`) runs the stock check every 10 minutes. It writes `status.json` and `stock-history.json` to KV.
- Both bind the same KV namespace as `STOCK_KV`.
- The landing pages are static. When a status changes, the Worker calls the Pages deploy hook to rebuild them, at most once an hour.

## Values needed

| Value | Where it goes |
| --- | --- |
| Cloudflare account ID | `CLOUDFLARE_ACCOUNT_ID` env for wrangler |
| API token with Workers Scripts:Edit, Workers KV Storage:Edit, Cloudflare Pages:Edit | `CLOUDFLARE_API_TOKEN` env for wrangler (or GitHub secret if deploys move to CI) |
| KV namespace id | `id` in both `wrangler.toml` files |
| Pages deploy hook URL | `wrangler secret put PAGES_DEPLOY_HOOK` on the Worker |
| DNS access to the domain (zone in Cloudflare, or the registrar) | only for the cutover |

## Setup

```sh
export CLOUDFLARE_ACCOUNT_ID=...   # never commit these
export CLOUDFLARE_API_TOKEN=...
npx wrangler kv namespace create STOCK_KV        # put the id in both wrangler.toml files
npx wrangler pages project create steamhardwarestock --production-branch main
npx wrangler deploy --config cloudflare/wrangler.toml
npx wrangler secret put PAGES_DEPLOY_HOOK --config cloudflare/wrangler.toml
```

In the Pages project settings:

- Build command `npm run build`, output `dist`.
- Set `PRERENDER_SOURCE_URL` to the Pages URL (`https://steamhardwarestock.pages.dev`) so builds prerender from KV. The first build, before KV has data, falls back to one live check.
- Create the deploy hook and turn on Web Analytics. The landing pages load the Vercel Analytics script, which only works on Vercel.

## Parallel run and cutover

1. Deploy both and leave Vercel as is. Run them side by side for at least 48 hours.
2. Compare `https://steamhardwarestock.pages.dev/status.json` with the Vercel `/status.json`. The `regions` and `cells` should match, and `generatedAt` should move every 10 minutes.
3. Check the Worker logs: 31 Steam requests per run and no errors.
4. Only then point DNS at Pages. Keep the Vercel project for a quick rollback, then turn off its cron.
