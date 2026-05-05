'use strict';

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

function formatCell(isoString) {
  if (!isoString) return '-';
  return `${formatRelativeTime(isoString)} (${formatDateTime(isoString)})`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sourceLabel(source) {
  return source === 'komodo' ? 'Komodo' : 'Steam';
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
  el.textContent = ` Last activity: ${formatRelativeTime(iso)} (${formatDateTime(iso)}).`;
}

function renderProductFilter() {
  const fieldset = document.getElementById('filterProducts');
  if (!fieldset) return;
  const products = new Map();
  for (const entry of state.entries) {
    if (entry.productId && !products.has(entry.productId)) {
      products.set(entry.productId, entry.productName || entry.productId);
    }
  }
  const sorted = [...products.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const existing = fieldset.querySelector('legend');
  fieldset.innerHTML = '';
  if (existing) fieldset.appendChild(existing); else {
    const legend = document.createElement('legend');
    legend.textContent = 'Products';
    fieldset.appendChild(legend);
  }
  for (const [id, name] of sorted) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(id)}"> ${escapeHtml(name)}`;
    const input = label.querySelector('input');
    input.checked = state.filters.products.has(id);
    input.addEventListener('change', () => {
      if (input.checked) state.filters.products.add(id);
      else state.filters.products.delete(id);
      renderTable();
    });
    fieldset.appendChild(label);
  }
}

function renderTable() {
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

  const table = document.createElement('table');
  table.className = 'history-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th>
        <th>Region</th>
        <th>Source</th>
        <th>Status</th>
        <th>Last in stock</th>
        <th>Last out of stock</th>
        <th>Events</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  for (const entry of filtered) {
    const tr = document.createElement('tr');
    const inStock = isCurrentlyInStock(entry);
    const statusBadge = inStock
      ? '<span class="badge available">In stock</span>'
      : '<span class="badge out">Out of stock</span>';
    tr.innerHTML = `
      <td>${escapeHtml(entry.productName || entry.productId || '-')}</td>
      <td>${escapeHtml(entry.region || '-')}<span class="region-full-name"> ${escapeHtml(regionFullName(entry.region))}</span></td>
      <td>${escapeHtml(sourceLabel(entry.source))}</td>
      <td>${statusBadge}</td>
      <td>${escapeHtml(formatCell(entry.lastInStock))}</td>
      <td>${escapeHtml(formatCell(entry.lastOutOfStock))}</td>
      <td>${escapeHtml(String(Array.isArray(entry.events) ? entry.events.length : 0))}</td>
    `;
    tbody.append(tr);
  }
  table.append(tbody);
  contentEl.append(table);
}

function bindFilters() {
  const region = document.getElementById('filterRegion');
  const sort = document.getElementById('filterSort');
  const reset = document.getElementById('filterReset');
  region.addEventListener('input', () => {
    state.filters.region = region.value;
    renderTable();
  });
  sort.addEventListener('change', () => {
    state.filters.sort = sort.value;
    renderTable();
  });
  for (const radio of document.querySelectorAll('input[name="filterStatus"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        state.filters.status = radio.value;
        renderTable();
      }
    });
  }
  for (const radio of document.querySelectorAll('input[name="filterSource"]')) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        state.filters.source = radio.value;
        renderTable();
      }
    });
  }
  reset.addEventListener('click', () => {
    state.filters = { region: '', sort: 'lastInStock', status: 'all', source: 'all', products: new Set() };
    region.value = '';
    sort.value = 'lastInStock';
    document.querySelector('input[name="filterStatus"][value="all"]').checked = true;
    document.querySelector('input[name="filterSource"][value="all"]').checked = true;
    renderProductFilter();
    renderTable();
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
  renderTable();
}

document.addEventListener('DOMContentLoaded', () => {
  bindFilters();
  loadHistory();
});
