# Privacy and consent

## Google Analytics and Consent Mode v2

GA (`G-D4LRTXD5LR`) runs with Google Consent Mode v2. The head of every page sets the defaults (`lib/analytics.mjs`) before the GA loader and `config`:

- `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` are **denied** for the EEA (the EU 27 plus Iceland, Liechtenstein and Norway), the UK and Switzerland, with `wait_for_update: 500`.
- They are **granted** everywhere else.
- A choice saved in `localStorage` (`shs-consent`, `granted` or `denied`) is applied with `consent update` in the same script, before `config`. A returning visitor is never counted under the default.

This is Consent Mode's advanced setup: with consent denied, GA sets no cookies and sends cookieless pings. Every GA event follows the consent state, including `affiliate_click`, `alert_subscribe` and `product_card_click`.

### Events

- `affiliate_click`: see [affiliate.md](affiliate.md).
- `alert_subscribe`: someone starts watching a product. Params:
  - `product`: the product slug. From the homepage it is the picked slugs joined with commas in catalog order.
  - `channel`: `rss` for the RSS link in the alert box on product pages, `tab` for the alert box button (it opens the tracker in a tab) and for the homepage Start watching button.
  - `source`: `product_page` or `homepage`.

  On product pages, delegated click and submit listeners in `lib/landing.mjs` are inlined in the page, and `tab` is sent on the form's submit so a button press counts once. On the homepage, `public/app.js` sends it when Start watching actually starts watching, so a press with no product or no country picked sends nothing. It does nothing if `gtag` is missing or throws. GA4 only reports `channel` and `source` once they are registered as event-scoped custom dimensions.
- `product_card_click`: someone clicks a product card (`.pcard`): the homepage cards, "Often checked with" on product pages and "Other Valve hardware" on country pages. Params:
  - `product`: the slug the card links to, for example `steam-deck` or `steam-deck-black-friday`.
  - `product_name`: the name on the card.
  - `position`: the card's place in its list, from 1.
  - `page`: the path of the page it was clicked on.
  - `country`: the country in the card's link on country pages, the country picked in the alert box on product pages, and the countries picked on the homepage joined with commas. Empty if none is picked yet.

  One delegated click listener, `installCardTracking` in `lib/landing.mjs`, is inlined in every page with cards. It is sent with `transport_type: 'beacon'` so the navigation to the card's page does not drop it. On the homepage, `public/app.js` keeps the picked countries on `<html data-countries>` for it. It does nothing if `gtag` is missing or throws. `product` and `position` are already event-scoped custom dimensions. GA4 only reports `product_name`, `page` and `country` once they are registered too.

Switzerland is included because its data protection law (revDSG) covers the same tracking, and Google asks for consent there for ads. Iceland, Liechtenstein and Norway are in the EEA, so GDPR applies.

Cloudflare Web Analytics sets no cookies and collects no personal data, so it is not gated.

## The banner

`public/consent.js` is inlined into every page. It shows the banner when:

- no choice is saved, and
- the browser time zone belongs to a consent region, or the time zone is unknown, empty or UTC (privacy browsers report UTC).

Accept and Reject are the same size and style. "Privacy choices" in every footer opens the banner again. The banner is a labelled region, its buttons are keyboard focusable, and focus returns to the footer link when it closes. It is `position: fixed`, so showing or hiding it never moves the page.

### Why the time zone

A static page cannot read the visitor's country:

- **`CF-IPCountry`** is a request header. Static files never see it, so it would need a Pages Function on every page view, or a `/cdn-cgi/trace` fetch. The fetch would also show the banner late.
- **`navigator.language`** describes the visitor's language, not where they are. English speakers in the EU would miss the banner.
- **The time zone** is available at once, needs no request, works on any host, and matches the country for almost everyone.

Errors in the time zone check only change whether the banner shows. Google applies the GA defaults itself from the visitor's IP, so a visitor whose time zone check misses still gets the denied default, and is simply never asked. The check errs toward showing the banner.

No third-party consent platform is used.
