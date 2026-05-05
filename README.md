# Steam Hardware Stock Tracker

[![CI](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml/badge.svg)](https://github.com/rfsbraz/steamhardwarestock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Open-source browser app for tracking official Steam hardware availability by country.

Live at [steamhardwarestock.com](https://steamhardwarestock.com/)

## What it tracks

- Steam Controller
- Steam Deck
- Steam Frame
- Steam Machine

Checks official Steam product pages directly so you can watch for real stock instead of relying on scalpers or resale listings.

## Features

- Check availability across multiple countries at once
- Browser notifications and audio alert when something comes in stock
- Watching state persists across page reloads
- No account, no server, no data collected

## Running locally

Requires Node.js 20+.

```sh
npm start
```

Then open `http://127.0.0.1:5177`.

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
