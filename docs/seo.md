# SEO

## Canonical host

The canonical origin is the apex, `https://steamhardwarestock.com` (`lib/site.mjs`). Canonical tags, `og:url`, JSON-LD, the sitemap and robots.txt all use it. `test/seo.test.mjs` fails if `www.` or `http://` URLs show up in the build output.

### www to apex redirect (dashboard step)

Pages `_redirects` matches paths only, not hostnames, so it cannot send `www` to the apex. The redirect has to be set up on the platform that serves the domain.

The domain is on Cloudflare. Attach both hostnames to the Pages project, then add a Single Redirect rule on the zone:

- Dashboard: Rules, Redirect Rules, Create rule.
  - When: `(http.host eq "www.steamhardwarestock.com")`
  - Then: Dynamic, expression `concat("https://steamhardwarestock.com", http.request.uri.path)`, status 301, preserve query string on.
- Or the API, with a token that has Zone, Single Redirect: Edit:

```sh
curl -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_request_dynamic_redirect/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"rules":[{"description":"www to apex","expression":"(http.host eq \"www.steamhardwarestock.com\")","action":"redirect","action_parameters":{"from_value":{"status_code":301,"preserve_query_string":true,"target_url":{"expression":"concat(\"https://steamhardwarestock.com\", http.request.uri.path)"}}}}]}'
```

The `www` record must be proxied (orange cloud) for the rule to run. This PUT replaces any existing redirect rules in that phase.

## URL form (no trailing slash)

Every page URL has no trailing slash: `/steam-frame/us`, not `/steam-frame/us/`. Canonicals, `og:url`, the sitemap and internal links all use that form.

Pages are written as `<path>.html` (`pageFile` in `scripts/prerender.mjs`), because Cloudflare Pages serves `/x` from `x.html` with a 200 and sends `/x/` to `/x` with a 308. A `x/index.html` file does the reverse and sends `/x` to `/x/`, which put every sitemap URL behind a redirect (#34). `test/trailing-slash.test.mjs` checks every sitemap URL and internal link against those rules. New pages get this for free if they are written through `writePage`.

## Pages and indexing

- `/<product>` and `/<product>/<country>` are prerendered for every product and all 59 countries.
- A country page is **indexable** when the product can be bought there: the 31 Steam countries, plus Japan, South Korea, Hong Kong and Taiwan for the Deck and the Controller (sold by Komodo, Valve's distributor). The other pages are `noindex,follow` and left out of the sitemap. They are almost identical ("not sold here"), and Search Console showed 267 pages "Discovered, currently not indexed". The product page lists every country, so it serves "available countries" searches instead.
- Indexable country pages carry their own data:
  - status and Steam price per model in the local currency;
  - Steam's delivery estimate;
  - recorded restocks for that country;
  - the status of the other products there.
- Titles stay at 60 characters or less, and descriptions at 160 or less. Both are unique across the site (tested).

## Search terms

Copy is in `lib/seo.mjs` (`PRODUCT_SEO`). The choices came from the Search Console export for 12 Jul to 11 Oct 2026:

| Signal | Data | Change |
| --- | --- | --- |
| Frame and Machine searches are about availability and countries | "steam frame availability" 436 impressions, "steam frame available countries" 114 at 14.9% CTR, "steam machine available countries" 98, "steam machine country availability" 45 | Titles lead with "Availability" and "by Country". The product page lists the countries Steam sells in. |
| "tracker" searches get impressions but few clicks | "steam hardware tracker" 1,080 impressions at 1.1% CTR, "steam controller tracker" 440 at 0.45% | The homepage title starts "Steam Hardware Tracker". The Controller title says "Stock Tracker". |
| Dock searches are about restocks and being out of stock | "steam deck dock restock" 79, "steam deck dock out of stock" 65, "docking station restock" 41 | Dock title "Restock: Out of Stock Tracker". The page leads with whether the dock is discontinued, the last in stock dates and a Europe section |
| Deck restock searches rank badly | "steam deck restock tracker" 98 impressions at position 21.9, "steam deck stock alert" at 29.5 | Deck title "Restock Tracker", plus a restock section with recorded restocks |
| Country searches | "steam frame chile", "steam machine malta", "steam controller cyprus" | Country page titles read "<product> Stock in <country>: <status>" |

Since 26 Oct 2026 the homepage and the Frame, Dock, Machine, Deck and Controller pages run the round 1 CTR test copy. Their titles and descriptions are fixed text (`description` in `PRODUCT_SEO`, and `public/index.html`), with no live in-stock count, so the copy stays the same for the whole test. `test/search-copy.test.mjs` pins it. The H1, body and country pages are unchanged.

## Product structured data

Search Console reported "Product snippets: 0 valid, 4 invalid" and "Merchant listings: 0 valid, 2 invalid". The old offers had no price.

- A Product is output only when at least one offer has a price. Google requires offers, reviews or a rating on a Product.
- Each Offer has `price` (a number), `priceCurrency` (ISO 4217), `availability` (a schema.org URL) and `url` (the Steam page for that country).
  - Status maps to availability: in stock is InStock, reservations open is PreOrder, waitlist is BackOrder, out of stock is OutOfStock.
  - Prices come from Steam's `GetItems` at build time. A formatted price that does not match the country's currency is dropped.
- The product page carries one offer per Steam country for the base model. A country page carries one offer.

Shipping and return policy fields are not set. Google lists them as recommended for merchant listings, and Valve's terms vary by country.

## Unknown paths

The build writes a top-level `404.html` (`renderNotFoundPage` in `lib/landing.mjs`). Cloudflare Pages serves it with a 404 status for any path no file matches, such as `/faq` or `/status`. Without it Pages falls back to `index.html` with a 200, which Search Console treats as a soft 404. The page is `noindex`, has no canonical and is not in the sitemap. `test/not-found.test.mjs` covers it.

## Sitemap

`sitemap.xml` is written by `scripts/prerender.mjs`. It lists the indexable pages only. Each `lastmod` is the time of the last recorded stock change for that page, from the history data. A page with no recorded change has no `lastmod`. The build time is never used. `robots.txt` points at it.

## Countries Steam does not sell in

`lib/availability.mjs` records what each product's Steam page says about sales outside the Steam store. It was checked on 13 Oct 2026:

- Komodo sells the Steam Deck and Steam Controller in Japan, South Korea, Hong Kong and Taiwan.
- Komodo sells the Steam Frame and Steam Machine in Japan, Taiwan and Hong Kong.
- Valve says the Steam Frame comes to South Korea at a later date, and that the Steam Machine will not be sold there.

Those pages have their own text and a link to Valve's page, so they are indexed and in the sitemap. All other country pages where Steam does not sell a product read the same apart from the name, so they stay `noindex`. `test/not-sold.test.mjs` and the sitemap test in `test/seo.test.mjs` enforce this. When Valve changes a launch, update `AVAILABILITY` and its source.

## FAQ blocks

Product and country pages end with a short FAQ (`lib/faq.mjs`), marked up as `FAQPage` JSON-LD with the same text as the visible answers. Answers are built from that page's own data: the status at the last check, the local Steam price and currency, the last recorded restock, and the status of the other products in that country. So no two country pages share an FAQ. Countries Steam does not sell in get two short answers, and Komodo countries get Komodo answers. `test/faq.test.mjs` checks that every answer names its country and that no two country pages of a product share an FAQ.

## Valve Index page

Valve stopped making the Valve Index and sells the remaining stock at 20% off while supplies last (Steam's "Valve Index Sunset" page, 13 Oct 2026). `/valve-index` tracks its nine Steam packages as parts (`parts: true` in `lib/products.mjs`), from the headset to the face gasket.

- A country counts as in stock when any part is. To avoid claiming more than Steam shows, every in-stock label names the count, such as "4 of 9 parts in stock" (`StockStatus.partsLabel`, `lib/parts.mjs`). This applies to the product table, country pages, titles, descriptions, FAQ answers, the live tracker card and change alerts.
- The product page has a "Remaining parts" table with each part's US price and the number of countries that have it in stock. Country pages list every part, priced or not.
- The copy quotes Valve and does not promise a restock. `test/valve-index.test.mjs` covers it.

## Steam Frame Replacement Kit page

`/steam-frame-replacement-kit` tracks Steam package 1727366 (face gasket, head cushion and standard light blocker). On 26 Oct 2026 Steam flagged it `account_restricted_from_purchasing` in every country, with an account purchase date requirement of 27 Apr 2026, and its page reads "Login for purchase". The checker uses no account, so a restricted package reads Out of stock even where Steam has units (US and CA that day). The page says the limit may mean Frame owners only and marks that unverified. `test/replacement-kit.test.mjs` covers it.

## Steam Deck Black Friday page

`/steam-deck-black-friday` (`lib/deck-sale.mjs`) shows new and refurbished Steam Deck stock per model and country, any discount Steam lists at build time, and an FAQ with `FAQPage` JSON-LD. It is in the sitemap, with `lastmod` from the Deck and refurbished history. The homepage links to it until `SEASON_END` (5 Jan 2027). Accessory links use the same JSAUX slot as the other pages (`docs/affiliate.md`), so with no ref ID the page shows no JSAUX links.

## Meta descriptions and IndexNow

Every page description is 120 to 155 characters and every title 20 to 60 (`test/meta-lengths.test.mjs` renders each page type across the data states a build can see). Bing reports descriptions under about 120 characters as too short.

Each Pages deploy publishes `/indexnow-manifest.json`, a hash of every sitemap page's content without check times, relative ages or asset names. After the deploy, `scripts/indexnow.mjs` sends IndexNow the URLs whose hash differs from the live manifest saved before the deploy, plus new and removed URLs. Sitemap lastmod is not used for this because it only follows stock events, so copy and code changes never moved it (#41). With no live manifest (the first run, or a failed fetch) every URL is submitted once. The key is public by design and is served from `/<key>.txt`. Cloudflare Crawler Hints also pings IndexNow; it is a zone setting and is not managed from this repo.
