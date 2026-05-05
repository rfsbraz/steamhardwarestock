# Steam Hardware Stock Tracker

[![CI](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml/badge.svg)](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Open-source browser app for checking official Steam hardware availability by country.

Live site: https://steamhardwarestock.com/

## What It Tracks

- Steam Controller
- Steam Deck
- Steam Frame
- Steam Machine

The tracker checks official Steam product pages and Steam's public hardware availability endpoint. It is meant to help people watch official stock instead of relying on scalpers or resale listings.

## Features

- Country-specific Steam hardware checks.
- Browser notifications when watched hardware becomes available.
- Product and country selection stored locally in the browser.
- Automatic country default based on browser timezone or language hints.
- Static frontend with a small allowlisted proxy for Steam requests.
- No accounts, database, analytics backend, or paid service dependency.

## How It Works

The app runs mostly in the browser from `public/app.js`. Steam does not currently send browser CORS headers for the product pages or hardware API, so deployed versions need a tiny same-origin proxy.

The proxy only allows requests to:

```text
https://store.steampowered.com/hardware/*
https://store.steampowered.com/sale/*
https://store.steampowered.com/steamdeck
https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/
```

Product discovery starts from Steam product pages. When Steam publishes reservation widgets or package IDs, the app uses those IDs to query Steam's hardware endpoint. Multi-model hardware, such as Steam Deck, is tracked as separate package options. Products without published stock-checkable packages show as `No package yet`.

## Requirements

- Node.js 20 or newer
- npm, included with Node.js

This project has no npm runtime dependencies.

## Local Development

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:5177
```

The local server serves files from `public/` and exposes the same `/proxy` route used by the deployed app.

## Project Scripts

```powershell
npm run check
npm run build
npm start
```

- `npm run check` syntax-checks the server, proxy, build script, client app, and service worker.
- `npm run build` copies `public/` into `dist/`.
- `npm start` runs the local development server.

## Project Structure

```text
api/proxy.js       Vercel serverless proxy for Steam requests
public/            Static browser app, styles, manifest, SEO files
scripts/build.js   Static build script
server.js          Local development server and proxy
vercel.json        Vercel routing, build, headers, and function config
```

## Deployment

The project is designed for Vercel as a static site plus one serverless function.

Recommended Vercel settings:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: dist
```

The included `vercel.json` sets `framework` to `null`, builds `dist/`, serves `/` from `/index.html`, keeps `/sw.js` uncached, and rewrites `/proxy` to `/api/proxy`.

Maintainer production deploys are handled by GitHub Actions on pushes to `main`. The deploy workflow expects:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `RELEASE_PLEASE_TOKEN` recommended, with `GITHUB_TOKEN` as the fallback

## Contributing

Contributions are welcome. Good changes for this project are usually small, testable, and focused on one behavior at a time.

Before opening a pull request:

1. Run `npm run check`.
2. Run `npm run build` if static assets changed.
3. Keep unrelated formatting or generated-file churn out of the PR.
4. Open an issue first for large behavior changes, new deployment targets, or changes to Steam parsing logic.

Please read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).

## Releases

Releases are managed with release-please. Conventional commits merged into `main` open or update a release PR. Merging that release PR creates the GitHub release, tag, changelog, and package version bump.

## Privacy

The app stores preferences in browser `localStorage`. The project does not have user accounts or a database. Deployed proxy requests may still appear in normal hosting provider logs.

## Security

Please do not open public issues for vulnerabilities. Follow the reporting guidance in [SECURITY.md](SECURITY.md).

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Valve Corporation or Steam. Steam, Steam Deck, Steam Controller, Steam Frame, Steam Machine, and related marks are trademarks or registered trademarks of Valve Corporation.

## License

MIT. See [LICENSE](LICENSE).
