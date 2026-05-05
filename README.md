# Steam Hardware Stock Tracker

[![CI](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml/badge.svg)](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Browser stock watcher for Steam Controller, Steam Frame, and Steam Machine availability by country.

Production site:

```text
https://steamhardwarestock.com/
```

## Features

- Tracks Steam Controller, Steam Frame, and Steam Machine product pages.
- Checks country-specific Steam hardware availability.
- Sends browser notifications when watched hardware becomes available.
- Defaults to Steam Controller and the browser timezone's likely country.
- Helps buyers watch official Steam stock instead of overpaying scalpers.

## Run Locally

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:5177
```

## Vercel Deployment

This project is ready for Vercel as a static site plus one serverless proxy function.

- Build command: `npm run build`
- Output directory: `dist`
- Serverless function: `api/proxy.js`
- Production domain: `steamhardwarestock.com`

The included `vercel.json` configures the build, static output, service-worker cache header, and rewrites `/proxy` to `/api/proxy`.

## Why There Is A Proxy

The app's stock-checking logic lives in `public/app.js`, and the product/country catalogs are client-side. Steam does not currently send browser CORS headers for the hardware API or product pages, so live checks need a tiny allowlisted proxy.

The proxy only allows:

```text
https://store.steampowered.com/hardware/*
https://store.steampowered.com/sale/*
https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/
```

## Product Checks

The app watches product pages instead of asking users for package ids. It discovers hardware package ids from the Steam page reservation widget when Steam publishes them. If package ids are available, it checks stock through Steam's public hardware endpoint.

Steam Controller currently exposes a stock-checkable package. Steam Frame and Steam Machine currently have live pages but no published hardware package widget, so they show as `No package yet` until Steam adds purchasable or reservable packages.

## SEO Files

The static build includes production metadata for `steamhardwarestock.com`, plus:

- `robots.txt`
- `sitemap.xml`
- `site.webmanifest`
- `favicon.svg`

## Project Scripts

```powershell
npm run check
npm run build
npm start
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before opening large changes.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Valve Corporation or Steam. Steam, Steam Controller, Steam Frame, Steam Machine, and related marks are trademarks or registered trademarks of Valve Corporation.

## License

MIT. See [LICENSE](LICENSE).
