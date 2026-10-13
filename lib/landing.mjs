import { REGIONS, isCheckable } from './products.mjs';
import StockStatus from '../public/stock-status.js';

const SITE = 'https://steamhardwarestock.com';
const ANALYTICS = '<script defer src="/_vercel/insights/script.js"></script>';

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Current status from the cron's status.json. Regions the cron skips are not
// sold there. With no status.json at all the page says it was not checked yet.
function cellStatus(statusDoc, product, regionCode) {
  if (!statusDoc) return null;
  if (!Array.isArray(statusDoc.regions) || !statusDoc.regions.includes(regionCode)) return 'unavailable_in_region';
  return statusDoc.products?.[product.id]?.[regionCode]?.status || null;
}

function statusCopy(status) {
  return status ? StockStatus.copyFor(status).label : 'Not checked yet';
}

function lastCheckHtml(statusDoc) {
  if (!statusDoc?.generatedAt) return '<p class="intro">Last check: not checked yet.</p>';
  return `<p class="intro">Last check: <time datetime="${escape(statusDoc.generatedAt)}">${escape(formatDate(statusDoc.generatedAt))}</time>.</p>`;
}

function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(diff / 86_400_000);
  return `${d}d ago`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toUTCString();
}

function steamUrl(product, regionCode) {
  if (!product.steamPath) return null;
  const u = new URL(product.steamPath, 'https://store.steampowered.com');
  if (regionCode) u.searchParams.set('cc', regionCode);
  u.searchParams.set('l', 'english');
  return u.toString();
}

function shellHead({ title, description, canonical, ogTitle, ogDescription, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<meta name="theme-color" content="#202124">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://clan.akamai.steamstatic.com">
<link rel="preconnect" href="https://clan.fastly.steamstatic.com">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Steam Hardware Stock Tracker">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:title" content="${escape(ogTitle || title)}">
<meta property="og:description" content="${escape(ogDescription || description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(ogTitle || title)}">
<meta name="twitter:description" content="${escape(ogDescription || description)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script>(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='auto';document.documentElement.dataset.theme=t;}catch(_){document.documentElement.dataset.theme='auto';}})();</script>
</head>`;
}

function shellFooter() {
  return `<footer class="site-footer"><div class="footer-inner"><a href="/">Tracker</a> · <a href="/history">History</a> · <a href="https://github.com/rfsbraz/steamhardwarestock">GitHub</a></div></footer>`;
}

function breadcrumbsLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url
    }))
  };
}

export function renderProductPage(product, history, statusDoc) {
  const canonical = `${SITE}/${product.id}`;
  const checkable = isCheckable(product);

  const rows = REGIONS.map((region) => {
    const key = `${product.id}:${region.code}`;
    const entry = history[key];
    const status = checkable ? cellStatus(statusDoc, product, region.code) : null;
    const inStock = status === 'in_stock';
    const lastIn = entry?.lastInStock ? relativeTime(entry.lastInStock) : null;
    return { region, entry, inStock, lastIn, status };
  });
  const inStockCount = rows.filter((r) => r.inStock).length;

  const title = checkable
    ? `${product.name} stock by country — ${inStockCount} of ${REGIONS.length} regions in stock`
    : `${product.name} availability — Steam Hardware Stock Tracker`;
  const description = checkable
    ? `${product.name} live stock status across ${REGIONS.length} countries on the Steam Store. Currently in stock in ${inStockCount} ${inStockCount === 1 ? 'region' : 'regions'}.`
    : `${product.name} is not yet available for purchase. Track availability across ${REGIONS.length} countries on Steam.`;

  const tableRows = rows.map((r) => {
    const url = `${SITE}/${product.id}/${r.region.code.toLowerCase()}`;
    const statusLabel = !checkable ? 'Coming soon' : statusCopy(r.status);
    const statusClass = !checkable ? 'pending' : (r.status || 'unknown');
    return `<tr>
      <td><a href="/${product.id}/${r.region.code.toLowerCase()}">${escape(r.region.code)} — ${escape(r.region.name)}</a></td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>${r.lastIn ? `<time datetime="${escape(r.entry.lastInStock)}">${escape(r.lastIn)}</time>` : '—'}</td>
    </tr>`;
  }).join('');

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.blurb,
    image: product.icon,
    brand: { '@type': 'Brand', name: 'Valve' },
    offers: rows.filter((r) => checkable && r.entry).map((r) => ({
      '@type': 'Offer',
      url: steamUrl(product, r.region.code),
      availability: r.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      areaServed: { '@type': 'Country', name: r.region.name },
      seller: { '@type': 'Organization', name: 'Valve' }
    }))
  };

  const breadcrumbs = breadcrumbsLd([
    { name: 'Home', url: SITE },
    { name: product.name, url: canonical }
  ]);

  return `${shellHead({
    title,
    description,
    canonical,
    jsonLd: [productLd, breadcrumbs]
  })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/">← All products</a></p>
      <h1>${escape(product.name)} stock by country</h1>
    </div>
  </header>

  <p class="intro">${escape(product.blurb)} ${checkable ? `Currently in stock in <strong>${inStockCount}</strong> of ${REGIONS.length} tracked regions.` : 'Not yet available for purchase on the Steam Store.'}</p>

  ${lastCheckHtml(statusDoc)}

  <section class="results-section" aria-label="Per-region stock">
    <table class="history-table">
      <thead>
        <tr><th scope="col">Country</th><th scope="col">Status</th><th scope="col">Last in stock</th></tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </section>

  <p class="intro" style="margin-top:24px"><a href="/?product=${escape(product.id)}">Open in live tracker →</a> ${product.steamPath ? `· <a href="${escape(steamUrl(product))}" rel="noreferrer" target="_blank">Steam Store page →</a>` : ''}</p>

  ${shellFooter()}
</main>
${ANALYTICS}
</body>
</html>`;
}

export function renderRegionPage(product, region, history, statusDoc) {
  const canonical = `${SITE}/${product.id}/${region.code.toLowerCase()}`;
  const checkable = isCheckable(product);
  const key = `${product.id}:${region.code}`;
  const entry = history[key];
  const current = checkable ? cellStatus(statusDoc, product, region.code) : null;
  const inStock = current === 'in_stock';
  const lastIn = entry?.lastInStock || null;

  const status = !checkable ? 'Coming soon' : statusCopy(current);
  const statusClass = !checkable ? 'pending' : (current || 'unknown');

  const title = !checkable
    ? `${product.name} availability in ${region.name} — Steam Hardware Stock Tracker`
    : (inStock
        ? `${product.name} is in stock in ${region.name} on Steam`
        : `${product.name} is out of stock in ${region.name} on Steam`);

  const description = !checkable
    ? `${product.name} is not yet available for purchase. Track availability in ${region.name} on the Steam Store.`
    : (inStock
        ? `${product.name} is currently available to buy from the Steam Store in ${region.name}.${lastIn ? ` In stock since ${formatDate(lastIn)}.` : ''}`
        : `${product.name} is currently out of stock on the Steam Store in ${region.name}.${lastIn ? ` Last in stock ${relativeTime(lastIn)}.` : ' No in-stock observations recorded yet.'}`);

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.blurb,
    image: product.icon,
    brand: { '@type': 'Brand', name: 'Valve' },
    offers: checkable ? {
      '@type': 'Offer',
      url: steamUrl(product, region.code),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      areaServed: { '@type': 'Country', name: region.name },
      seller: { '@type': 'Organization', name: 'Valve' }
    } : undefined
  };

  const breadcrumbs = breadcrumbsLd([
    { name: 'Home', url: SITE },
    { name: product.name, url: `${SITE}/${product.id}` },
    { name: region.name, url: canonical }
  ]);

  return `${shellHead({
    title,
    description,
    canonical,
    jsonLd: [productLd, breadcrumbs]
  })}
<body>
<main class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow"><a href="/${escape(product.id)}">← ${escape(product.name)} (all countries)</a></p>
      <h1>${escape(product.name)} stock in ${escape(region.name)}</h1>
    </div>
  </header>

  <section class="results-section">
    <p class="intro"><span class="badge ${statusClass}" style="font-size:1rem;padding:6px 12px">${escape(status)}</span></p>

    ${lastCheckHtml(statusDoc)}

    <dl class="result-grid" style="margin-top:16px">
      ${lastIn ? `<div><dt>Last in stock</dt><dd><time datetime="${escape(lastIn)}">${escape(formatDate(lastIn))}</time> (${escape(relativeTime(lastIn))})</dd></div>` : ''}
      ${entry?.lastOutOfStock ? `<div><dt>Last out of stock</dt><dd><time datetime="${escape(entry.lastOutOfStock)}">${escape(formatDate(entry.lastOutOfStock))}</time> (${escape(relativeTime(entry.lastOutOfStock))})</dd></div>` : ''}
    </dl>

    <p class="intro" style="margin-top:24px">
      ${product.steamPath ? `<a href="${escape(steamUrl(product, region.code))}" rel="noreferrer" target="_blank">Buy on Steam (${escape(region.code)}) →</a> · ` : ''}<a href="/?product=${escape(product.id)}&amp;region=${escape(region.code)}">Open in live tracker →</a>
    </p>
  </section>

  ${shellFooter()}
</main>
${ANALYTICS}
</body>
</html>`;
}
