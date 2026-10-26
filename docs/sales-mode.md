# Sales mode and Valve updates

## Button state

Each check records the button Steam shows for every product in every region, next to the status. It is stored in `status.json` as `button` on each region and on each package.

| `button` | Shown as | When |
| --- | --- | --- |
| `buy` | Buy | Status `in_stock`: `inventory_available` is true and nothing blocks the purchase. `high_pending_orders` (high demand) does not block it |
| `reserve` | Reserve | Status `reservation_open`: `requires_reservation` is true and Steam is not running a waitlist |
| `waitlist` | Join waitlist | Status `waitlist`: `requires_reservation` plus `position_is_waitlist`, `queue_in_waitlist` or `high_pending_orders` |
| `unavailable` | Unavailable | Anything else: out of stock (including `high_pending_orders` with no inventory), `reservation_not_allowed`, `account_restricted_from_purchasing`, or `allow_purchase_in_country` false |

`buttonFor(details)` in `public/stock-status.js` maps the status from `classifyDetails`, so the button and the status read the same fields in the same order and can never disagree. A product with several models takes the best button: Buy, then Reserve, then Join waitlist.

The `/steam-frame/status`, `/steam-machine/status` and `/steam-controller/status` pages show this per country. Countries outside `VALVE_SELLS` show "Not sold on Steam", and Komodo countries show "Sold via Komodo" for the products Komodo carries.

## Valve updates

`data/valve-updates.json` holds the latest official update per product, edited by hand:

```json
{ "product": "steam-frame", "date": "2026-10-09", "title": "Valve's post title", "summary": "Our own short summary.", "source": "https://store.steampowered.com/news/group/45479024/view/..." }
```

- Only add posts from Valve's own Steam Hardware news (`store.steampowered.com/news/group/45479024`), and link the post.
- Write the summary yourself, and stick to what the post says.
- The status page shows the newest entry for the product. Older entries can stay.

## Worker cost

`scripts/measure-worker.mjs` replays recorded Steam answers through `runCheck` and reports CPU time and KV writes per run (`--capture` records them first, `--regions all` tries every country in `REGIONS`).

Measured on 13 Oct 2026:

| | 31 regions (today) | 59 regions (all) |
| --- | --- | --- |
| Local replay CPU, median / p90 | 3.8 ms / 9.7 ms | 5.2 ms / 12.7 ms |
| Subrequests per run | 31 | 59 |
| KV writes per run | 1 (2 when a status changes, plus 1 per GitHub dispatch) | same |

Production (Cloudflare analytics, last 24 hours, 34 runs): CPU p50 15.2 ms, p90 20.9 ms, max 26.6 ms, no errors. 32 KV writes over those 34 runs.

The free plan allows 10 ms of CPU per cron run and 50 subrequests, and 1,000 KV writes a day. Writes are fine: about 150 a day at 144 runs. CPU is already over 10 ms in production, and Cloudflare is currently tolerating it. All 59 regions would also need 59 Steam requests, which is over the 50 subrequest limit. So the region list was not expanded.
