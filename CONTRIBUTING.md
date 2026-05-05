# Contributing

Thanks for helping improve Steam Hardware Stock Tracker.

## Development

```powershell
npm start
npm run check
npm run build
```

This project intentionally avoids a frontend build chain. Most application logic lives in `public/app.js`; the Vercel proxy lives in `api/proxy.js`.

## Pull Requests

- Keep changes focused and small where possible.
- Run `npm run check` before opening a pull request.
- Run `npm run build` when changing static assets or deployment config.
- Do not add dependencies unless they remove meaningful complexity.
- Do not add broad proxy targets. The proxy should stay allowlisted to Steam hardware pages and the Steam hardware API.

## Product Data

The app discovers Steam hardware package ids from Steam pages when possible. If adding or changing products, prefer stable Steam product page paths and avoid hardcoding volatile API responses.

## Legal

Do not imply that this project is affiliated with Valve or Steam.
