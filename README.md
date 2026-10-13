# Steam Hardware Stock Tracker

[![CI](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml/badge.svg)](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Open-source browser app for tracking official Steam hardware availability by country.

Live at [steamhardwarestock.com](https://steamhardwarestock.com/)

## What it tracks

- Steam Controller
- Steam Deck (OLED, and the LCD where Valve still sells it new)
- Steam Deck (Valve Certified Refurbished)
- Steam Deck Dock
- Steam Frame
- Steam Machine

Each product and country gets one of these statuses:

- **In stock**: you can buy it now.
- **Reservations open**: Steam takes a reservation and emails you when your order can be placed.
- **Waitlist**: Steam has a queue. You join the waitlist on the Steam page.
- **Out of stock**: no inventory right now.
- **Not sold here**: Steam does not sell it in that country.

The rules live in `public/stock-status.js`, which the browser and the server cron share.

A server check reads Steam's official hardware API every 10 minutes, and every open tab reads that one result, so you can watch for real stock instead of relying on scalpers or resale listings.

## Features

- Check availability across multiple countries at once
- Browser notifications and audio alert when something comes in stock
- Watching state persists across page reloads
- No account, no data collected

## Running locally

Requires Node.js 20+.

```sh
npm start
```

Then open `http://127.0.0.1:5177`.

## Hosting

Production runs on Vercel (`vercel.json`). A Cloudflare Pages and Worker setup is ready but not deployed; see [docs/cloudflare.md](docs/cloudflare.md).

## SEO

Canonical host, page rules, structured data and the sitemap are described in [docs/seo.md](docs/seo.md).

## Affiliate links

The site can show JSAUX and Amazon accessory links. They are off until the IDs are set; see [docs/affiliate.md](docs/affiliate.md).

## Contributing

Small, focused changes are most welcome. Run `npm run check` before opening a PR, and open an issue first for larger behavior changes.

Please read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).

## Privacy

Preferences are stored in browser `localStorage` only. No user accounts, no database, no tracking beyond standard hosting logs.

## Disclaimer

This project is not affiliated with, endorsed by, or sponsored by Valve Corporation or Steam. Steam, Steam Deck, Steam Controller, Steam Frame, Steam Machine, and related marks are trademarks or registered trademarks of Valve Corporation.

## License

MIT. See [LICENSE](LICENSE).

## ☕ Support

If you find this useful and want to support development, you can [buy me a coffee](https://buymeacoffee.com/rfsbraz) - no pressure at all, just a nice way to say thanks.
