// The one source for analytics tags. scripts/build.js swaps the markers in
// public/*.html for these, and lib/landing.mjs adds them to the prerendered pages.
export const GA_ID = 'G-D4LRTXD5LR';

export const ANALYTICS_HEAD = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_ID}');
    </script>`;

export const ANALYTICS_BODY = '<script defer src="/_vercel/insights/script.js"></script>';

export const HEAD_MARKER = '<!-- analytics:head -->';
export const BODY_MARKER = '<!-- analytics:body -->';

export function injectAnalytics(html) {
  return html.replace(HEAD_MARKER, ANALYTICS_HEAD).replace(BODY_MARKER, ANALYTICS_BODY);
}
