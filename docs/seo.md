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
| Dock searches are about restocks and being out of stock | "steam deck dock restock" 79, "steam deck dock out of stock" 65, "docking station restock" 41 | Dock title "Restock: Out of Stock Tracker" |
| Deck restock searches rank badly | "steam deck restock tracker" 98 impressions at position 21.9, "steam deck stock alert" at 29.5 | Deck title "Restock Tracker", plus a restock section with recorded restocks |
| Country searches | "steam frame chile", "steam machine malta", "steam controller cyprus" | Country page titles read "<product> Stock in <country>: <status>" |

## Product structured data

Search Console reported "Product snippets: 0 valid, 4 invalid" and "Merchant listings: 0 valid, 2 invalid". The old offers had no price.

- A Product is output only when at least one offer has a price. Google requires offers, reviews or a rating on a Product.
- Each Offer has `price` (a number), `priceCurrency` (ISO 4217), `availability` (a schema.org URL) and `url` (the Steam page for that country).
  - Status maps to availability: in stock is InStock, reservations open is PreOrder, waitlist is BackOrder, out of stock is OutOfStock.
  - Prices come from Steam's `GetItems` at build time. A formatted price that does not match the country's currency is dropped.
- The product page carries one offer per Steam country for the base model. A country page carries one offer.

Shipping and return policy fields are not set. Google lists them as recommended for merchant listings, and Valve's terms vary by country.

## Sitemap

`sitemap.xml` is written by `scripts/prerender.mjs`. It lists the indexable pages only. Each `lastmod` is the time of the last recorded stock change for that page, from the history data. A page with no recorded change has no `lastmod`. The build time is never used. `robots.txt` points at it.

## FAQ blocks

Product and country pages end with a short FAQ (`lib/faq.mjs`), marked up as `FAQPage` JSON-LD with the same text as the visible answers. Answers are built from that page's own data: the status at the last check, the local Steam price and currency, the last recorded restock, and the status of the other products in that country. So no two country pages share an FAQ. Countries Steam does not sell in get two short answers, and Komodo countries get Komodo answers. `test/faq.test.mjs` checks that every answer names its country and that no two country pages of a product share an FAQ.
