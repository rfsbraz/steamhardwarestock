# Contributing

Thanks for helping improve Steam Hardware Stock Tracker.

## Development

```powershell
npm start
npm run check
npm test
npm run build
```

This project intentionally avoids a frontend build chain. Most application logic lives in `public/app.js`.

How stock data flows:

- The Worker (`cloudflare/worker.mjs`, every 10 minutes) checks Steam and writes `status.json` and the history to Cloudflare KV. It is the only writer.
- Browsers read `/status.json` (served by `functions/status.json.js` and cached by the CDN for a minute) and the history from `/api/history`. They never call Steam.
- `npm run build` prerenders `/`, `/<product>` and `/<product>/<region>` into `dist/` with the current status (`scripts/prerender.mjs`, templates in `lib/landing.mjs`). It reads `status.json` and the history from `PRERENDER_SOURCE_URL` when set, and otherwise runs one live check. Set `PRERENDER_OFFLINE=1` to skip the live check. The static pages are as fresh as the last deploy, and the Worker triggers a deploy when a status changes.
- Analytics tags (GA `G-D4LRTXD5LR` and the Cloudflare Web Analytics beacon) live only in `lib/analytics.mjs`. `public/index.html` and `public/history.html` carry `<!-- analytics:head -->` and `<!-- analytics:body -->` markers that the build replaces, so `npm start` serves pages without tracking. `test/analytics.test.mjs` checks every built page.
- Affiliate links live in `public/affiliate.js`, with empty IDs in `affiliate.config.json`. Real IDs come from build env vars (see `docs/affiliate.md`). Never commit them. `BUILD_DIST` builds into another folder, which the tests use.
- `lib/komodo-proxy.mjs` (served by `functions/proxy.js`) is only used for Komodo Station pages (Japan, Korea, Hong Kong, Taiwan).
- Locally, `npm start` serves a live `status.json` from one check per request. Set `STATUS_FIXTURE=path/to/status.json` to serve a file instead, for example to test alerts.

## Pull Requests

- Keep changes focused and small where possible.
- Run `npm run check` before opening a pull request.
- Run `npm run build` when changing static assets or deployment config.
- Do not add dependencies unless they remove meaningful complexity.
- Do not add broad proxy targets. The proxy is allowlisted to Komodo Station product pages only.

## Product Data

The stock cron sends one Steam `GetHardwareItems` request per region, with every tracked packageId in it. It only checks the regions in `VALVE_SELLS` in `lib/products.mjs`, which are the regions where Steam sells Valve hardware. Japan, Korea, Hong Kong and Taiwan are sold through Komodo Station instead. Keep the request count per run under 50 so it fits a Cloudflare Worker's free subrequest limit.


The app discovers Steam hardware package ids from Steam pages when possible. If adding or changing products, prefer stable Steam product page paths and avoid hardcoding volatile API responses.

## Legal

Do not imply that this project is affiliated with Valve or Steam.
