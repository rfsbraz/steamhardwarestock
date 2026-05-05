'use strict';

function formatRelativeTime(isoString) {
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
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(isoString));
}

function formatCell(isoString) {
  if (!isoString) return '-';
  return `${formatRelativeTime(isoString)} (${formatDateTime(isoString)})`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sourceLabel(source) {
  return source === 'komodo' ? 'Komodo' : 'Steam';
}

async function loadHistory() {
  const messageEl = document.getElementById('historyMessage');
  const contentEl = document.getElementById('historyContent');

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

  const entries = Object.values(data);
  if (!entries.length) {
    messageEl.textContent = 'No history recorded yet. History is captured while watching.';
    return;
  }

  entries.sort((a, b) => {
    const aTs = a.lastInStock ? new Date(a.lastInStock).getTime() : 0;
    const bTs = b.lastInStock ? new Date(b.lastInStock).getTime() : 0;
    return bTs - aTs;
  });

  messageEl.textContent = '';

  const table = document.createElement('table');
  table.className = 'history-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th>
        <th>Region</th>
        <th>Source</th>
        <th>Last in stock</th>
        <th>Last out of stock</th>
        <th>Events</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  for (const entry of entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(entry.productName || entry.productId || '-')}</td>
      <td>${escapeHtml(entry.region || '-')}</td>
      <td>${escapeHtml(sourceLabel(entry.source))}</td>
      <td>${escapeHtml(formatCell(entry.lastInStock))}</td>
      <td>${escapeHtml(formatCell(entry.lastOutOfStock))}</td>
      <td>${escapeHtml(String(Array.isArray(entry.events) ? entry.events.length : 0))}</td>
    `;
    tbody.append(tr);
  }
  table.append(tbody);
  contentEl.append(table);
}

document.addEventListener('DOMContentLoaded', loadHistory);
