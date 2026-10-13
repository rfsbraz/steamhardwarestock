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

## Disclosures

- Next to the links: "We may earn a commission when you buy through these links, at no extra cost to you." When Amazon links show, it also says "As an Amazon Associate I earn from qualifying purchases."
- In the footer of the homepage and the landing pages: the same lines, shown only when the matching links are on.

## Click tracking

One delegated click listener sends `gtag('event', 'affiliate_click', { product, partner, link })`. It does nothing if `gtag` is missing or throws. The homepage gets it from `affiliate.js`, and the landing pages get it inline, from the same function.

## Links

The links are in `public/affiliate.js` (`JSAUX` and `AMAZON`). The JSAUX collections were checked on 13 Oct 2026. Steam Frame has no JSAUX collection yet, so it shows no block.
