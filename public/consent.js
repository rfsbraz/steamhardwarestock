// GA consent banner for the EEA, the UK and Switzerland (Google Consent Mode v2).
// The consent defaults are set in the page head (lib/analytics.mjs). This
// script only decides whether to show the banner and records the choice.
// It is inlined into every page, so it must stay self-contained.
(function (root) {
  'use strict';

  var KEY = 'shs-consent';
  var FIELDS = ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'];

  // A static page cannot see the visitor's country, so the time zone stands in
  // for it. Unknown, empty or UTC (privacy browsers) means show the banner.
  var ZONES = [
    'Europe/Vienna', 'Europe/Brussels', 'Europe/Sofia', 'Europe/Zagreb', 'Asia/Nicosia', 'Asia/Famagusta',
    'Europe/Nicosia', 'Europe/Prague', 'Europe/Copenhagen', 'Europe/Tallinn', 'Europe/Helsinki',
    'Europe/Mariehamn', 'Europe/Paris', 'Europe/Berlin', 'Europe/Busingen', 'Europe/Athens',
    'Europe/Budapest', 'Europe/Dublin', 'Eire', 'Europe/Rome', 'Europe/Riga', 'Europe/Vilnius',
    'Europe/Luxembourg', 'Europe/Malta', 'Europe/Amsterdam', 'Europe/Warsaw', 'Poland', 'Europe/Lisbon',
    'Portugal', 'Atlantic/Madeira', 'Atlantic/Azores', 'Europe/Bucharest', 'Europe/Bratislava',
    'Europe/Ljubljana', 'Europe/Madrid', 'Africa/Ceuta', 'Atlantic/Canary', 'Europe/Stockholm',
    'Atlantic/Reykjavik', 'Iceland', 'Europe/Vaduz', 'Europe/Oslo', 'Arctic/Longyearbyen',
    'Europe/Zurich', 'Europe/London', 'Europe/Belfast', 'GB', 'GB-Eire', 'Europe/Guernsey',
    'Europe/Jersey', 'Europe/Isle_of_Man', 'Europe/Gibraltar', 'Atlantic/Faroe'
  ];
  var UNSURE = ['', 'UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Etc/Unknown', 'Factory'];

  function needsBanner(timeZone) {
    if (!timeZone || UNSURE.indexOf(timeZone) !== -1) return true;
    return ZONES.indexOf(timeZone) !== -1;
  }

  function currentTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (_) {
      return '';
    }
  }

  function readChoice(storage) {
    try {
      var v = storage && storage.getItem(KEY);
      return v === 'granted' || v === 'denied' ? v : null;
    } catch (_) {
      return null;
    }
  }

  function consentState(choice) {
    var state = {};
    for (var i = 0; i < FIELDS.length; i++) state[FIELDS[i]] = choice;
    return state;
  }

  function saveChoice(storage, choice, gtag) {
    try {
      storage.setItem(KEY, choice);
    } catch (_) {
      // Private mode or full storage: the choice holds for this page only.
    }
    if (typeof gtag === 'function') gtag('consent', 'update', consentState(choice));
  }

  function shouldShow(opts) {
    return !opts.choice && needsBanner(opts.timeZone);
  }

  function bannerHtml() {
    return '<section id="consent-banner" class="consent-banner" role="region" aria-labelledby="consent-title" aria-describedby="consent-text" hidden>' +
      '<div class="consent-inner">' +
      '<p id="consent-title" class="consent-title">Analytics cookies</p>' +
      '<p id="consent-text" class="consent-text">We use Google Analytics to count visits and clicks. If you reject, it sets no cookies and only sends anonymous pings without identifiers. Stock alerts work either way.</p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="consent-button" data-consent="denied">Reject</button>' +
      '<button type="button" class="consent-button" data-consent="granted">Accept</button>' +
      '</div></div></section>';
  }

  function mount(doc, win) {
    var holder = doc.createElement('div');
    holder.innerHTML = bannerHtml();
    var el = holder.firstChild;
    doc.body.appendChild(el);
    el.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-consent]') : null;
      if (!btn) return;
      saveChoice(win.localStorage, btn.getAttribute('data-consent'), win.gtag);
      el.hidden = true;
      if (el.__opener && el.__opener.focus) el.__opener.focus();
    });
    return el;
  }

  function init(doc, win) {
    var el = null;
    function show(opener) {
      el = el || mount(doc, win);
      el.__opener = opener || null;
      el.hidden = false;
      if (opener) {
        var first = el.querySelector('[data-consent]');
        if (first) first.focus();
      }
    }
    var storage;
    try { storage = win.localStorage; } catch (_) { storage = null; }
    if (shouldShow({ timeZone: currentTimeZone(), choice: readChoice(storage) })) show(null);
    doc.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('[data-consent-settings]') : null;
      if (!link) return;
      event.preventDefault();
      show(link);
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && el && !el.hidden && el.__opener) {
        el.hidden = true;
        el.__opener.focus();
      }
    });
  }

  var api = { KEY: KEY, needsBanner: needsBanner, readChoice: readChoice, saveChoice: saveChoice, shouldShow: shouldShow, bannerHtml: bannerHtml, init: init };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SteamConsent = api;
    if (root.document && root.document.body) init(root.document, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
