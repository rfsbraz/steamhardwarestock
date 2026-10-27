# Privacy and consent

## Google Analytics and Consent Mode v2

GA (`G-D4LRTXD5LR`) runs with Google Consent Mode v2. The head of every page sets the defaults (`lib/analytics.mjs`) before the GA loader and `config`:

- `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` are **denied** for the EEA (the EU 27 plus Iceland, Liechtenstein and Norway), the UK and Switzerland, with `wait_for_update: 500`.
- They are **granted** everywhere else.
- A choice saved in `localStorage` (`shs-consent`, `granted` or `denied`) is applied with `consent update` in the same script, before `config`. A returning visitor is never counted under the default.

This is Consent Mode's advanced setup: with consent denied, GA sets no cookies and sends cookieless pings. Every GA event follows the consent state, including `affiliate_click` and `alert_subscribe`.

### Events

- `affiliate_click`: see [affiliate.md](affiliate.md).
- `alert_subscribe`: someone starts watching a product. Params are `product` (the product slug) and `channel` (`rss` for now, the RSS link in the alert box on product pages). One delegated click listener in `lib/landing.mjs`, inlined in the product pages. It does nothing if `gtag` is missing or throws. GA4 only reports `channel` once it is registered as an event-scoped custom dimension.

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
