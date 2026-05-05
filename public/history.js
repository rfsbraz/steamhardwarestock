'use strict';

const STEAM_ORIGIN = 'https://store.steampowered.com';
const KOMODO_ORIGIN = 'https://komodostation.com';

const PRODUCTS = {
  'steam-controller': {
    name: 'Steam Controller',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/9d5d7384c51cd831aaf52dd47184ecd3.avif',
    steamPath: '/hardware/steamcontroller/',
    komodoPath: '/product/steam-controller/'
  },
  'steam-deck': {
    name: 'Steam Deck',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/6163a5d5ee139c8c07485f6e72fba875.avif',
    steamPath: '/steamdeck/',
    komodoPath: '/product/steam-deck_jpy/'
  },
  'steam-frame': {
    name: 'Steam Frame',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/82a194cce9b0912b2501236f4f4ef757.avif',
    steamPath: '/hardware/steamframe/'
  },
  'steam-machine': {
    name: 'Steam Machine',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/d3888f2e560b3a837f6f0a25345b03b6.avif',
    steamPath: '/hardware/steammachine/'
  }
};

const REGION_NAMES = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', IE: 'Ireland', AU: 'Australia',
  NZ: 'New Zealand', AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus',
  CZ: 'Czechia', DK: 'Denmark', EE: 'Estonia', FI: 'Finland', FR: 'France', DE: 'Germany',
  GR: 'Greece', HU: 'Hungary', IS: 'Iceland', IT: 'Italy', LV: 'Latvia', LT: 'Lithuania',
  LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland', PT: 'Portugal',
  RO: 'Romania', RS: 'Serbia', SK: 'Slovakia', SI: 'Slovenia', ES: 'Spain', SE: 'Sweden',
  CH: 'Switzerland', TR: 'Turkey', UA: 'Ukraine', AR: 'Argentina', BR: 'Brazil', CL: 'Chile',
  CO: 'Colombia', MX: 'Mexico', PE: 'Peru', HK: 'Hong Kong', IN: 'India', ID: 'Indonesia',
  JP: 'Japan', KZ: 'Kazakhstan', KR: 'South Korea', MY: 'Malaysia', PH: 'Philippines',
  TW: 'Taiwan', TH: 'Thailand', VN: 'Vietnam', AE: 'United Arab Emirates', IL: 'Israel',
  SA: 'Saudi Arabia', ZA: 'South Africa'
};

const state = {
  entries: [],
  filters: {
    region: '',
    sort: 'lastInStock',
    status: 'all',
    source: 'all',
    products: new Set()
  }
};

function formatRelativeTime(isoString) {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor(diff / 60000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(isoString));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function regionFullName(code) {
  return REGION_NAMES[code] || code;
}

function tsValue(entry) {
  return Math.max(
    entry.lastInStock ? Date.parse(entry.lastInStock) || 0 : 0,
    entry.lastOutOfStock ? Date.parse(entry.lastOutOfStock) || 0 : 0
  );
}

function isCurrentlyInStock(entry) {
  const inTs = entry.lastInStock ? Date.parse(entry.lastInStock) || 0 : 0;
  const outTs = entry.lastOutOfStock ? Date.parse(entry.lastOutOfStock) || 0 : 0;
  return inTs > outTs;
}

function storeUrl(entry) {
  const product = PRODUCTS[entry.productId];
  if (!product) return null;
  if (entry.source === 'komodo') {
    return product.komodoPath ? `${KOMODO_ORIGIN}${product.komodoPath}` : null;
  }
  if (!product.steamPath) return null;
  const url = new URL(product.steamPath, STEAM_ORIGIN);
  if (entry.region) url.searchParams.set('cc', entry.region);
  url.searchParams.set('l', 'english');
  return url.toString();
}

function statusInfo(entry) {
  const inStock = isCurrentlyInStock(entry);
  if (inStock) {
    return {
      cssClass: 'available',
      label: 'In stock',
      timelineLabel: 'In stock since',
      timelineTs: entry.lastInStock
    };
  }
  if (entry.lastInStock) {
    return {
      cssClass: 'out',
      label: 'Out of stock',
      timelineLabel: 'Last in stock',
      timelineTs: entry.lastInStock
    };
  }
  return {
    cssClass: 'out',
    label: 'Out of stock',
    timelineLabel: 'Out of stock since',
    timelineTs: entry.lastOutOfStock
  };
}

function applyFilters(entries) {
  const { filters } = state;
  const regionQuery = filters.region.trim().toUpperCase();
  return entries.filter((entry) => {
    if (regionQuery) {
      const code = (entry.region || '').toUpperCase();
      const name = regionFullName(entry.region).toUpperCase();
      if (!code.includes(regionQuery) && !name.includes(regionQuery)) return false;
    }
    if (filters.status === 'in' && !isCurrentlyInStock(entry)) return false;
    if (filters.status === 'out' && isCurrentlyInStock(entry)) return false;
    if (filters.source !== 'all' && (entry.source || 'steam') !== filters.source) return false;
    if (filters.products.size > 0 && !filters.products.has(entry.productId)) return false;
    return true;
  });
}

function applySort(entries) {
  const sorted = entries.slice();
  switch (state.filters.sort) {
    case 'lastOutOfStock':
      sorted.sort((a, b) => (Date.parse(b.lastOutOfStock) || 0) - (Date.parse(a.lastOutOfStock) || 0));
      break;
    case 'product':
      sorted.sort((a, b) => (a.productName || '').localeCompare(b.productName || '') || (a.region || '').localeCompare(b.region || ''));
      break;
    case 'region':
      sorted.sort((a, b) => (a.region || '').localeCompare(b.region || '') || (a.productName || '').localeCompare(b.productName || ''));
      break;
    case 'events':
      sorted.sort((a, b) => (b.events?.length || 0) - (a.events?.length || 0));
      break;
    case 'recent':
      sorted.sort((a, b) => tsValue(b) - tsValue(a));
      break;
    case 'lastInStock':
    default:
      sorted.sort((a, b) => (Date.parse(b.lastInStock) || 0) - (Date.parse(a.lastInStock) || 0));
  }
  return sorted;
}

function renderHistoryAsOf() {
  const el = document.getElementById('historyAsOf');
  if (!el) return;
  const latest = state.entries.reduce((max, e) => Math.max(max, tsValue(e)), 0);
  if (!latest) {
    el.textContent = '';
    return;
  }
  const iso = new Date(latest).toISOString();
  el.textContent = `Last activity: ${formatRelativeTime(iso)} (${formatDateTime(iso)})`;
}

function renderProductFilter() {
  const container = document.getElementById('filterProducts');
  if (!container) return;
  const products = new Map();
  for (const entry of state.entries) {
    if (entry.productId && !products.has(entry.productId)) {
      products.set(entry.productId, entry.productName || PRODUCTS[entry.productId]?.name || entry.productId);
    }
  }
  const sorted = [...products.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  container.innerHTML = '';
  for (const [id, name] of sorted) {
    const product = PRODUCTS[id];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.dataset.id = id;
    if (state.filters.products.has(id)) chip.classList.add('active');
    chip.innerHTML = `
      ${product?.icon ? `<img src="${escapeAttribute(product.icon)}" alt="" loading="lazy">` : ''}
      <span>${escapeHtml(name)}</span>
    `;
    chip.addEventListener('click', () => {
      if (state.filters.products.has(id)) {
        state.filters.products.delete(id);
        chip.classList.remove('active');
      } else {
        state.filters.products.add(id);
        chip.classList.add('active');
      }
      renderCards();
    });
    container.appendChild(chip);
  }
}

function renderCards() {
  const messageEl = document.getElementById('historyMessage');
  const contentEl = document.getElementById('historyContent');
  const countEl = document.getElementById('historyCounts');
  contentEl.innerHTML = '';

  if (!state.entries.length) {
    messageEl.textContent = 'No history recorded yet. History is captured while watching.';
    if (countEl) countEl.textContent = '0 entries';
    return;
  }

  const filtered = applySort(applyFilters(state.entries));
  if (countEl) {
    countEl.textContent = `${filtered.length} of ${state.entries.length} entries`;
  }
  if (!filtered.length) {
    messageEl.textContent = 'No entries match the current filters.';
    return;
  }

  messageEl.textContent = '';

  const grid = document.createElement('div');
  grid.className = 'history-grid';

  for (const entry of filtered) {
    const product = PRODUCTS[entry.productId];
    const status = statusInfo(entry);
    const link = storeUrl(entry);
    const eventCount = Array.isArray(entry.events) ? entry.events.length : 0;
    const sourceTag = entry.source === 'komodo' ? '<span class="source-tag">Komodo</span>' : '';
    const timelineRel = status.timelineTs ? formatRelativeTime(status.timelineTs) : '—';
    const timelineAbs = status.timelineTs ? formatDateTime(status.timelineTs) : '';

    const card = document.createElement('article');
    card.className = 'history-card';
    card.innerHTML = `
      <header class="history-card-head">
        <div class="history-product">
          ${product?.icon ? `<img class="history-product-icon" src="${escapeAttribute(product.icon)}" alt="" loading="lazy">` : ''}
          <div class="history-product-meta">
            <span class="history-product-name">${escapeHtml(entry.productName || product?.name || entry.productId || '—')} ${sourceTag}</span>
            <span class="history-region">
              <span class="history-region-code">${escapeHtml(entry.region || '—')}</span>
              <span class="region-full-name">${escapeHtml(regionFullName(entry.region))}</span>
            </span>
          </div>
        </div>
        <span class="badge ${status.cssClass}">${escapeHtml(status.label)}</span>
      </header>

      <div class="history-timeline">
        <span class="history-timeline-label">${escapeHtml(status.timelineLabel)}</span>
        <span class="history-timeline-value">${escapeHtml(timelineRel)}</span>
        ${timelineAbs ? `<span class="history-timeline-abs">${escapeHtml(timelineAbs)}</span>` : ''}
      </div>

      <dl class="history-meta">
        <div>
          <dt>Last in stock</dt>
          <dd>${entry.lastInStock ? escapeHtml(formatRelativeTime(entry.lastInStock)) : '—'}</dd>
        </div>
        <div>
          <dt>Last out of stock</dt>
          <dd>${entry.lastOutOfStock ? escapeHtml(formatRelativeTime(entry.lastOutOfStock)) : '—'}</dd>
        </div>
        <div>
          <dt>Events</dt>
          <dd>${eventCount}</dd>
        </div>
      </dl>

      ${link ? `<div class="history-card-actions"><a href="${escapeAttribute(link)}" target="_blank" rel="noreferrer">${entry.source === 'komodo' ? 'Komodo' : 'Steam'} page →</a></div>` : ''}
    `;
    grid.append(card);
  }

  contentEl.append(grid);
}

function bindFilters() {
  const region = document.getElementById('filterRegion');
  const sort = document.getElementById('filterSort');
  const reset = document.getElementById('filterReset');
  region.addEventListener('input', () => {
    state.filters.region = region.value;
    renderCards();
  });
  sort.addEventListener('change', () => {
    state.filters.sort = sort.value;
    renderCards();
  });
  for (const seg of document.querySelectorAll('.segmented')) {
    const name = seg.dataset.filter;
    seg.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-value]');
      if (!btn) return;
      for (const b of seg.querySelectorAll('button')) b.classList.remove('active');
      btn.classList.add('active');
      state.filters[name] = btn.dataset.value;
      renderCards();
    });
  }
  reset.addEventListener('click', () => {
    state.filters = { region: '', sort: 'lastInStock', status: 'all', source: 'all', products: new Set() };
    region.value = '';
    sort.value = 'lastInStock';
    for (const seg of document.querySelectorAll('.segmented')) {
      for (const b of seg.querySelectorAll('button')) {
        b.classList.toggle('active', b.dataset.value === 'all');
      }
    }
    renderProductFilter();
    renderCards();
  });
}

async function loadHistory() {
  const messageEl = document.getElementById('historyMessage');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let data;
  try {
    const res = await fetch('/api/history', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch {
    clearTimeout(timer);
    messageEl.textContent = 'Could not load history. Try refreshing.';
    return;
  }

  state.entries = Object.values(data || {});
  renderHistoryAsOf();
  renderProductFilter();
  renderCards();
}

document.addEventListener('DOMContentLoaded', () => {
  bindFilters();
  loadHistory();
});
