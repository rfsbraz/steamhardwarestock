# Changelog

## [1.1.0](https://github.com/rfsbraz/steamhardwarestock/compare/v1.0.0...v1.1.0) (2026-05-05)


### Features

* add next check countdown to summary strip ([94259fa](https://github.com/rfsbraz/steamhardwarestock/commit/94259fa776f949962ea625dc3ee220d646f8e315))
* audio alert and tab title change on stock detection ([763b55e](https://github.com/rfsbraz/steamhardwarestock/commit/763b55e7e2938d7e57d8e2065a8f81027151a4ba))
* availability change log with localStorage persistence ([36dc3d8](https://github.com/rfsbraz/steamhardwarestock/commit/36dc3d81765deaa1378fb3ab66b3f5e021b4694b))
* dark mode with system preference detection and toggle ([8f19714](https://github.com/rfsbraz/steamhardwarestock/commit/8f197148aad363821f7fa1cd336cb5339ae81e10))
* improve country selector, add product icons, add test sound button ([75c8d91](https://github.com/rfsbraz/steamhardwarestock/commit/75c8d91e32cd513923fb8ef834c3fe60a653ce36))
* persist and restore watching state across page reloads ([f5e83b0](https://github.com/rfsbraz/steamhardwarestock/commit/f5e83b051d6e745707713b4be779d04223278b36))
* prompt for notifications on start and add intro text ([e52b719](https://github.com/rfsbraz/steamhardwarestock/commit/e52b7198578528768cf52d7413b7d4ca65c2fac9))
* reduce region grid to major countries, add custom autocomplete ([54944fe](https://github.com/rfsbraz/steamhardwarestock/commit/54944feea47e85ead5d17ee059cae11795741f06))
* track Steam Deck models ([49c5e1e](https://github.com/rfsbraz/steamhardwarestock/commit/49c5e1e41ed87ed12861bd4a1838b24273965310))


### Bug Fixes

* add dark background to product chip icons ([c079d5d](https://github.com/rfsbraz/steamhardwarestock/commit/c079d5d5822cc995d6dd2aba1114bba287efe4cd))
* add renotify to prevent chrome silencing repeat notifications ([b57a666](https://github.com/rfsbraz/steamhardwarestock/commit/b57a666eeb61ba7cfef305babd943cf9a26571fa))
* improve notification test fallback ([f09dc48](https://github.com/rfsbraz/steamhardwarestock/commit/f09dc48c1dcabb3896ba47ea3fd50e83c5b46099))
* **notifications:** await active SW before showNotification and guard fallback ([3af73e6](https://github.com/rfsbraz/steamhardwarestock/commit/3af73e67d384393735357e6f6aa795a03b75974f))
* **notifications:** prevent SW ready hang and surface silent notify failure ([5578e3f](https://github.com/rfsbraz/steamhardwarestock/commit/5578e3f6101f50f0b732d819e9da2f102abb2418))
* relabel high pending orders badge to Out of stock ([adb2d64](https://github.com/rfsbraz/steamhardwarestock/commit/adb2d64aa49d6fd257fa56aaf8a03a5c775ffc8c))
* use Steam hardware page product images for chips ([a92ea85](https://github.com/rfsbraz/steamhardwarestock/commit/a92ea85c60ba43fcda50935dc8b901be0ebe5f7f))


### Performance

* content-hash app.js and styles.css for proper immutable caching ([ea34d41](https://github.com/rfsbraz/steamhardwarestock/commit/ea34d41fbef7395dc6eaa988c703529aa4317b8c))
* convert proxy to edge function, add cdn caching for static assets ([fb66315](https://github.com/rfsbraz/steamhardwarestock/commit/fb6631538fc2cf26160960bc29cf90c0d833aa0b))
* use Vercel-CDN-Cache-Control for deploy-aware asset caching ([32b8c7e](https://github.com/rfsbraz/steamhardwarestock/commit/32b8c7ed2d512e2b15df692259f85360e78f2877))
