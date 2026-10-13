import { SITE } from './site.mjs';

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// pages: [{ path, lastmod }]. lastmod is the last recorded stock change for
// the page, or omitted when there is none. It is never the build time.
export function buildSitemap(pages) {
  const urls = pages.map((p) => `  <url>
    <loc>${escapeXml(`${SITE}${p.path}`)}</loc>${p.lastmod ? `
    <lastmod>${escapeXml(p.lastmod)}</lastmod>` : ''}
  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}
