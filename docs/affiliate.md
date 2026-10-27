# Affiliate links

Accessory links show under each product's stock status, in the live tracker and on the prerendered landing pages. They are plain links with `rel="sponsored noopener"` and `target="_blank"`. No third-party scripts are loaded. The research behind this is in the cost plan (ads options, JSAUX first).

## Config

`affiliate.config.json` is committed with empty placeholders. Set the real values as build env vars, so nothing has to be committed. On Cloudflare Pages, which deploys through `.github/workflows/pages-deploy.yml`, use GitHub repository variables with the same names:

| Env var | Meaning |
| --- | --- |
| `AFFILIATE_JSAUX_REF` | JSAUX UpPromote referral code, added as `?sca_ref=` |
| `AFFILIATE_AMAZON_ENABLED` | `1` or `true` to turn on the Amazon slot. Off by default. |
| `AFFILIATE_AMAZON_TAG` | Amazon Associates tag, for example `name-20` |

The build bakes the result into the hashed `affiliate.js` and the landing pages. Change a value and redeploy.

## Behavior with empty values

- **No JSAUX ID:** no JSAUX links and no disclosure. Plain links would send traffic to JSAUX for free, and a disclosure with no affiliate links would be wrong.
- **Amazon flag off, or no tag:** no Amazon links and no Amazon disclosure.
- **Nothing set** (the default): the site looks exactly as before.

## Product cards

On the Steam Deck, Dock and Controller pages, and in the matching homepage rows, the JSAUX text links are replaced by a strip of up to four product cards: image, name, price, the old price struck through and a `-NN%` badge when JSAUX lists one, and a "Shop at JSAUX" button. Each card links to `/go/jsaux-<handle>` on this site, which sends a 302 to the product page with `?sca_ref=` (see [/go/ links](#go-links)).

- `lib/jsaux-feed.mjs` reads `https://jsaux.com/collections/all/products.json` during the build. `DEAL_PICKS` is the hand-picked list of handles per page, in display order. Steam Deck and Steam Controller items only: anything with Switch, ROG Ally or Legion in the title is dropped. The Valve Index has no picks because JSAUX sells nothing for it.
- The price is the cheapest in-stock variant. It counts as a sale only when that variant's `compare_at_price` is higher. Sold-out products are skipped.
- Images are fetched at 320px from the Shopify CDN and copied into `dist/deals/`, so visitors load nothing from JSAUX or Shopify.
- The build skips the feed when `PRERENDER_OFFLINE=1` or there is no JSAUX ref. If the fetch fails, the pages keep the text links.
- `pages-deploy.yml` also runs daily at 05:30 UTC, so prices and the "checked" date are at most a day old. It reuses the existing deploy secrets. `scripts/indexnow.mjs` leaves the strip out of the content hash, so price changes alone don't ping IndexNow.
- Tests use a recorded copy of the feed in `test/fixtures/jsaux-products.json`.

## Promo pill

`jsaux.promo` in `affiliate.config.json` adds a pill next to the strip title, for example `{ "label": "JSAUX Halloween Sale, until 5 Nov", "endsAt": "2026-11-06T08:00:00Z", "coupon": "" }`. Builds after `endsAt` leave it out, and the landing pages remove it in the browser once `endsAt` has passed, so a page built before the end never shows an old sale. Set `coupon` to an affiliate code to show ", code CODE" in the pill. Without a label or a valid date the promo is ignored. It only shows with the product cards.

## Disclosures

- On the cards: a small "Ad" tag whose tooltip is the full sentence below, and a line under the cards: "Prices from jsaux.com in USD, checked <date>. Affiliate links", linking to `/disclosures`.
- Next to the text links: "We may earn a commission when you buy through these links, at no extra cost to you." When Amazon links show, it also says "As an Amazon Associate I earn from qualifying purchases."
- In the footer of the homepage and the landing pages: the same lines, shown only when the matching links are on.

## Click tracking

One delegated click listener sends `gtag('event', 'affiliate_click', { product, partner, link, format })`. `format` is `card` for a product card and `link` for a text link, so the two can be compared. Card clicks also send `item`, the JSAUX product handle, and `position`, the card's place in the strip from 1. GA4 only reports `format`, `item` and `position` once they are registered as event-scoped custom dimensions in the property. It does nothing if `gtag` is missing or throws. The homepage gets it from `affiliate.js`, and the landing pages get it inline, from the same function.

## /go/ links

Card buttons go through a first-party path, `/go/jsaux-<handle>`, so each click is also a request to this site. The text links still go straight to JSAUX.

- The build writes `dist/_redirects` with one rule per handle in `DEAL_PICKS`, for example `/go/jsaux-steam-deck-docking-station https://jsaux.com/products/steam-deck-docking-station?sca_ref=<ref> 302`. Without a JSAUX ref the rule has no `sca_ref`, so the path still works. Cloudflare Pages applies the file on deploy. Nothing else in Cloudflare needs to change.
- Picks that are not shown today keep their rule, so a cached page with an older card still redirects.
- `rel="sponsored noopener"`, `target="_blank"` and the `affiliate_click` event are unchanged. GA's `link` is now the `/go/` URL. `item` still has the handle.
- To check locally: `npm run build`, then `npx wrangler@4 pages dev dist` and `curl -sI http://127.0.0.1:8788/go/jsaux-<handle>`.

Reading the clicks in Cloudflare: a `/go/` hit is a 302 with no page, so the Web Analytics beacon does not see it. Use the edge request data instead:

- Dashboard: the steamhardwarestock.com zone, Analytics, Traffic, Add filter, Path, starts with `/go/`. The Path filter needs the Pro plan or higher.
- GraphQL Analytics API, any plan: `httpRequestsAdaptiveGroups` on the zone, filtered with `clientRequestPath_like: "/go/%"`, `edgeResponseStatus: 302` and `requestSource: "eyeball"`, grouped by `clientRequestPath`. Each path is one product, so the count per path is clicks per product. Every plan keeps about 30 days. It needs a token with Zone Analytics read, so ask whoever owns the Cloudflare account to run it or set up a Custom Dashboard with the same filter.

Edge counts include bots and prefetches, so expect them to run a bit higher than GA's `affiliate_click`. GA still has the page, the format and the card position.

## Links

The links are in `public/affiliate.js` (`JSAUX` and `AMAZON`). The JSAUX collections were checked on 13 Oct 2026. Steam Frame has no JSAUX collection yet, so it shows no block.
