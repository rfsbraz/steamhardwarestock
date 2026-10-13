// The one source for analytics tags (GA with Consent Mode v2, Vercel Analytics,
// Cloudflare Web Analytics). scripts/build.js swaps the markers in
// public/*.html for these, and lib/landing.mjs adds them to the prerendered pages.
import { readFileSync } from 'node:fs';

export const GA_ID = 'G-D4LRTXD5LR';

// EEA (EU 27 plus Iceland, Liechtenstein, Norway), the UK and Switzerland.
// Google applies the denied default to visitors it locates in these regions.
export const CONSENT_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'GB', 'CH'
];

const DENIED = "analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'";
const GRANTED = "analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted'";

// Consent defaults run before the GA loader and config. A choice saved by the
// banner (public/consent.js) is applied here too, so returning visitors are
// never tracked before their choice is known.
export const ANALYTICS_HEAD = `<script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      window.gtag = gtag;
      gtag('consent', 'default', { ${DENIED}, wait_for_update: 500, region: ${JSON.stringify(CONSENT_REGIONS).replace(/"/g, "'")} });
      gtag('consent', 'default', { ${GRANTED} });
      try {
        var shsConsent = localStorage.getItem('shs-consent');
        if (shsConsent === 'granted' || shsConsent === 'denied') {
          gtag('consent', 'update', { analytics_storage: shsConsent, ad_storage: shsConsent, ad_user_data: shsConsent, ad_personalization: shsConsent });
        }
      } catch (e) {}
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>`;

// The Cloudflare Web Analytics token is public by design.
export const CF_BEACON_TOKEN = '9f338d544ab84bbc920053a6f6cf222e';

const CONSENT_SCRIPT = readFileSync(new URL('../public/consent.js', import.meta.url), 'utf8');

// Vercel and Cloudflare Web Analytics set no cookies, so they do not wait for consent.
export const ANALYTICS_BODY = `<script defer src="/_vercel/insights/script.js"></script>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${CF_BEACON_TOKEN}"}'></script>
<script>${CONSENT_SCRIPT}</script>`;

export const CONSENT_LINK = '<a href="#privacy-choices" data-consent-settings>Privacy choices</a>';

export const HEAD_MARKER = '<!-- analytics:head -->';
export const BODY_MARKER = '<!-- analytics:body -->';
export const CONSENT_LINK_MARKER = '<!-- consent:link -->';

export function injectAnalytics(html) {
  return html.replace(HEAD_MARKER, ANALYTICS_HEAD).replace(BODY_MARKER, ANALYTICS_BODY).replace(CONSENT_LINK_MARKER, CONSENT_LINK);
}
