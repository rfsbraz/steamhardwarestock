// Affiliate accessory links. Loaded as a plain script in the browser
// (window.SteamAffiliate) and imported by the build and tests in Node.
// The build replaces the CONFIG line with affiliate.config.json plus env
// overrides. With an empty ID the matching links render nothing.
(function (root) {
  'use strict';

  const CONFIG = /*AFFILIATE_CONFIG*/{ jsaux: { refId: '' }, amazon: { enabled: false, tag: '' } }/*END_AFFILIATE_CONFIG*/;

  const JSAUX_ORIGIN = 'https://jsaux.com';
  const JSAUX = {
    'steam-deck': [
      { label: 'Steam Deck accessories', path: '/collections/steam-deck-accessories' },
      { label: 'Cases and screen protectors', path: '/collections/protectors-for-steam-deck' },
      { label: 'Chargers', path: '/collections/chargers-for-steam-deck' }
    ],
    'steam-deck-refurbished': [
      { label: 'Steam Deck LCD accessories', path: '/collections/steam-deck-lcd' },
      { label: 'Steam Deck OLED accessories', path: '/collections/steam-deck-oled' }
    ],
    'steam-dock': [
      { label: 'Cables and chargers', path: '/collections/cables-chargers-for-steam-deck' }
    ],
    'steam-controller': [
      { label: 'Steam Controller accessories', path: '/collections/steam-controller-accessories' }
    ],
    'steam-machine': [
      { label: 'Steam Machine accessories', path: '/collections/steam-machine-accessories' }
    ]
  };

  const AMAZON_ORIGIN = 'https://www.amazon.com';
  const AMAZON = {
    'steam-deck': [{ label: 'microSD cards', query: 'microsd card steam deck' }],
    'steam-deck-refurbished': [{ label: 'microSD cards', query: 'microsd card steam deck' }],
    'steam-machine': [{ label: 'USB-C hubs and storage', query: 'usb c hub nvme enclosure' }]
  };

  const DISCLOSURE = 'We may earn a commission when you buy through these links, at no extra cost to you.';
  const AMAZON_DISCLOSURE = 'As an Amazon Associate I earn from qualifying purchases.';
  const REL = 'sponsored noopener';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function str(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  // env keys: AFFILIATE_JSAUX_REF, AFFILIATE_AMAZON_TAG, AFFILIATE_AMAZON_ENABLED ("1" or "true").
  function resolveConfig(fileConfig, env) {
    const f = fileConfig || {};
    const e = env || {};
    const flag = e.AFFILIATE_AMAZON_ENABLED;
    return {
      jsaux: { refId: str(e.AFFILIATE_JSAUX_REF) || str(f.jsaux && f.jsaux.refId) },
      amazon: {
        enabled: flag !== undefined && flag !== '' ? flag === '1' || flag === 'true' : Boolean(f.amazon && f.amazon.enabled),
        tag: str(e.AFFILIATE_AMAZON_TAG) || str(f.amazon && f.amazon.tag)
      }
    };
  }

  function jsauxLinks(productId, config) {
    const ref = str(config.jsaux && config.jsaux.refId);
    if (!ref) return [];
    return (JSAUX[productId] || []).map((l) => {
      const url = new URL(l.path, JSAUX_ORIGIN);
      url.searchParams.set('sca_ref', ref);
      return { partner: 'jsaux', label: `JSAUX: ${l.label}`, url: url.toString() };
    });
  }

  function amazonLinks(productId, config) {
    const a = config.amazon || {};
    const tag = str(a.tag);
    if (!a.enabled || !tag) return [];
    return (AMAZON[productId] || []).map((l) => {
      const url = new URL('/s', AMAZON_ORIGIN);
      url.searchParams.set('k', l.query);
      url.searchParams.set('tag', tag);
      return { partner: 'amazon', label: `Amazon: ${l.label}`, url: url.toString() };
    });
  }

  function linkHtml(productId, link) {
    return `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="${REL}" data-affiliate="${escapeHtml(link.partner)}" data-product="${escapeHtml(productId)}">${escapeHtml(link.label)}</a></li>`;
  }

  function accessoryBlock(productId, config) {
    const c = config || CONFIG;
    const jsaux = jsauxLinks(productId, c);
    const amazon = amazonLinks(productId, c);
    if (!jsaux.length && !amazon.length) return '';
    const lines = [];
    if (jsaux.length) lines.push(DISCLOSURE);
    if (amazon.length) lines.push(AMAZON_DISCLOSURE);
    return `<aside class="affiliate-block" aria-label="Accessories">
  <span class="affiliate-title">Accessories</span>
  <ul class="affiliate-links">${[...jsaux, ...amazon].map((l) => linkHtml(productId, l)).join('')}</ul>
  <p class="affiliate-disclosure">${lines.map(escapeHtml).join(' ')}</p>
</aside>`;
  }

  function footerDisclosure(config) {
    const c = config || CONFIG;
    const lines = [];
    if (str(c.jsaux && c.jsaux.refId)) lines.push('Some links on this site are affiliate links. ' + DISCLOSURE);
    if (c.amazon && c.amazon.enabled && str(c.amazon.tag)) lines.push(AMAZON_DISCLOSURE);
    if (!lines.length) return '';
    return `<span class="affiliate-disclosure">${lines.map(escapeHtml).join(' ')}</span>`;
  }

  // One delegated listener for every affiliate link. Self-contained so the
  // landing pages can inline it with Function.prototype.toString.
  function installClickTracking(doc, win) {
    doc.addEventListener('click', function (event) {
      try {
        var target = event.target;
        var link = target && target.closest ? target.closest('a[data-affiliate]') : null;
        if (!link || typeof win.gtag !== 'function') return;
        win.gtag('event', 'affiliate_click', {
          product: link.getAttribute('data-product'),
          partner: link.getAttribute('data-affiliate'),
          link: link.href
        });
      } catch (_) {
        // Tracking must never block the click.
      }
    });
  }

  const api = { CONFIG, DISCLOSURE, AMAZON_DISCLOSURE, REL, JSAUX, AMAZON, resolveConfig, accessoryBlock, footerDisclosure, installClickTracking };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SteamAffiliate = api;
    if (root.document) installClickTracking(root.document, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
