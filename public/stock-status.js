// Shared stock status rules. Loaded as a plain script in the browser
// (window.SteamStockStatus) and imported by the cron and tests in Node.
(function (root) {
  'use strict';

  const STATUSES = ['in_stock', 'reservation_open', 'waitlist', 'out_of_stock', 'unavailable_in_region'];

  const COPY = {
    in_stock: { label: 'In stock', reason: 'Steam reports inventory is available for this country.' },
    reservation_open: { label: 'Reservations open', reason: 'Steam is taking reservations. You get an email when your order can be placed.' },
    waitlist: { label: 'Waitlist', reason: 'Steam has a queue for this item. You can join the waitlist on the Steam page.' },
    out_of_stock: { label: 'Out of stock', reason: 'Steam does not report available inventory.' },
    unavailable_in_region: { label: 'Not sold here', reason: 'Steam does not sell this hardware in the selected country.' }
  };

  function estimateFrom(details) {
    const t = Number(details && details.rtime_estimated_notification);
    return t > 0 ? new Date(t * 1000).toISOString() : null;
  }

  function make(status, details, reason) {
    return {
      status,
      state: status,
      found: status === 'in_stock',
      label: COPY[status].label,
      reason: reason || COPY[status].reason,
      estimate: estimateFrom(details)
    };
  }

  function classifyDetails(details) {
    if (!details) return make('out_of_stock', null, 'Steam did not return details for this package.');
    if (details.allow_purchase_in_country === false) return make('unavailable_in_region', details);
    if (details.requires_reservation) {
      if (details.reservation_not_allowed) return make('out_of_stock', details, 'Steam is not taking reservations right now.');
      if (details.position_is_waitlist || details.queue_in_waitlist || details.high_pending_orders) {
        return make('waitlist', details);
      }
      return make('reservation_open', details);
    }
    if (details.account_restricted_from_purchasing) return make('out_of_stock', details, 'Steam is not selling this item right now.');
    // high_pending_orders is Steam's high-demand flag. With inventory Steam
    // still shows Buy now, so inventory decides and the flag is only a note.
    if (details.inventory_available) {
      return make('in_stock', details, details.high_pending_orders ? `${COPY.in_stock.reason} Steam also flags high demand for it.` : undefined);
    }
    if (details.high_pending_orders) {
      return make('out_of_stock', details, 'Steam has a queue of pending orders, so the buy button is off. Units can come back when queued orders are cancelled.');
    }
    return make('out_of_stock', details);
  }

  // Best status wins: in stock, then reservations, then waitlist.
  function combineStatuses(statuses) {
    let best = null;
    for (const s of statuses) {
      if (!s) continue;
      if (!best || STATUSES.indexOf(s.status) < STATUSES.indexOf(best.status)) best = s;
    }
    return best || make('out_of_stock', null, 'No package to check.');
  }

  // The button Steam shows for a status. Derived from the same fields as the
  // status, so the two can never disagree. See docs/sales-mode.md.
  const BUTTONS = {
    buy: { label: 'Buy' },
    reserve: { label: 'Reserve' },
    waitlist: { label: 'Join waitlist' },
    unavailable: { label: 'Unavailable' }
  };
  const BUTTON_FOR_STATUS = {
    in_stock: 'buy',
    reservation_open: 'reserve',
    waitlist: 'waitlist',
    out_of_stock: 'unavailable',
    unavailable_in_region: 'unavailable'
  };
  const BUTTON_ORDER = Object.keys(BUTTONS);

  function buttonFor(details) {
    return BUTTON_FOR_STATUS[classifyDetails(details).status];
  }

  function combineButtons(buttons) {
    let best = 'unavailable';
    for (const b of buttons) if (BUTTON_ORDER.indexOf(b) >= 0 && BUTTON_ORDER.indexOf(b) < BUTTON_ORDER.indexOf(best)) best = b;
    return best;
  }

  function copyFor(status) {
    return COPY[status] || COPY.out_of_stock;
  }

  // Products sold as separate parts (the Valve Index). A country where only
  // some parts have stock reads "4 of 9 parts in stock", never "In stock".
  function partsLabel(statuses) {
    const n = statuses.filter((s) => s === 'in_stock').length;
    return n ? `${n} of ${statuses.length} parts in stock` : null;
  }

  const api = { STATUSES, BUTTONS, classifyDetails, combineStatuses, copyFor, buttonFor, combineButtons, partsLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SteamStockStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
