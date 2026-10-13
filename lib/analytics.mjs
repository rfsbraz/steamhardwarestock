// The one source for analytics tags (GA, Vercel Analytics, Cloudflare Web Analytics). scripts/build.js swaps the markers in
// public/*.html for these, and lib/landing.mjs adds them to the prerendered pages.
export const GA_ID = 'G-D4LRTXD5LR';

export const ANALYTICS_HEAD = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    </script>`;

// The Cloudflare Web Analytics token is public by design.
export const CF_BEACON_TOKEN = '9f338d544ab84bbc920053a6f6cf222e';

export const ANALYTICS_BODY = `<script defer src="/_vercel/insights/script.js"></script>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${CF_BEACON_TOKEN}"}'></script>`;

export const HEAD_MARKER = '<!-- analytics:head -->';
export const BODY_MARKER = '<!-- analytics:body -->';

export function injectAnalytics(html) {
  return html.replace(HEAD_MARKER, ANALYTICS_HEAD).replace(BODY_MARKER, ANALYTICS_BODY);
}
