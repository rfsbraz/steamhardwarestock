'use strict';

const STEAM_ORIGIN = 'https://store.steampowered.com';
const STEAM_HARDWARE_API = 'https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/';
const DISCOVERY_CACHE_MS = 60 * 1000;
const DEFAULT_PRODUCTS = ['steam-controller'];
const STORAGE_KEY = 'steam-hardware-stock-tracker-v3';
const CHANGELOG_KEY = 'steam-hardware-changelog-v1';
const CHANGELOG_MAX = 100;
const ORIGINAL_TITLE = document.title;
const MAJOR_REGIONS = new Set(['US', 'CA', 'GB', 'AU', 'NZ', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'PL', 'BR', 'MX', 'JP', 'KR', 'SG']);
const KOMODO_ORIGIN = 'https://komodostation.com';
const KOMODO_REGIONS = new Set(['JP', 'KR', 'HK', 'TW']);
const KOMODO_CATALOG = {
  'steam-deck': {
    path: '/product/steam-deck_jpy/',
    models: [
      { label: '512GB OLED', selector: 'pa_models_512gb-oled' },
      { label: '1TB OLED', selector: 'pa_models_1tb-oled' }
    ]
  },
  'steam-controller': {
    path: '/product/steam-controller/',
    models: null
  }
};
let audioContext = null;
let acIndex = -1;
let countdownInterval = null;

const PRODUCTS = [
  {
    id: 'steam-controller',
    name: 'Steam Controller',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/9d5d7384c51cd831aaf52dd47184ecd3.avif',
    paths: ['/hardware/steamcontroller/', '/sale/steamcontroller'],
    fallbackPackageIds: [1558609],
    fallbackAppIds: [4165870]
  },
  {
    id: 'steam-deck',
    name: 'Steam Deck',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/6163a5d5ee139c8c07485f6e72fba875.avif',
    paths: ['/steamdeck/'],
    fallbackPackageIds: [],
    fallbackAppIds: [1675200]
  },
  {
    id: 'steam-frame',
    name: 'Steam Frame',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/82a194cce9b0912b2501236f4f4ef757.avif',
    paths: ['/hardware/steamframe/', '/sale/steamframe'],
    fallbackPackageIds: [],
    fallbackAppIds: []
  },
  {
    id: 'steam-machine',
    name: 'Steam Machine',
    icon: 'https://clan.akamai.steamstatic.com/images/clan/45479024/d3888f2e560b3a837f6f0a25345b03b6.avif',
    paths: ['/hardware/steammachine/', '/sale/steammachine'],
    fallbackPackageIds: [],
    fallbackAppIds: []
  }
];

const COMMON_REGIONS = [
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['GB', 'United Kingdom'],
  ['IE', 'Ireland'],
  ['AU', 'Australia'],
  ['NZ', 'New Zealand'],
  ['AT', 'Austria'],
  ['BE', 'Belgium'],
  ['BG', 'Bulgaria'],
  ['HR', 'Croatia'],
  ['CY', 'Cyprus'],
  ['CZ', 'Czechia'],
  ['DK', 'Denmark'],
  ['EE', 'Estonia'],
  ['FI', 'Finland'],
  ['FR', 'France'],
  ['DE', 'Germany'],
  ['GR', 'Greece'],
  ['HU', 'Hungary'],
  ['IS', 'Iceland'],
  ['IT', 'Italy'],
  ['LV', 'Latvia'],
  ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'],
  ['MT', 'Malta'],
  ['NL', 'Netherlands'],
  ['NO', 'Norway'],
  ['PL', 'Poland'],
  ['PT', 'Portugal'],
  ['RO', 'Romania'],
  ['RS', 'Serbia'],
  ['SK', 'Slovakia'],
  ['SI', 'Slovenia'],
  ['ES', 'Spain'],
  ['SE', 'Sweden'],
  ['CH', 'Switzerland'],
  ['TR', 'Turkey'],
  ['UA', 'Ukraine'],
  ['AR', 'Argentina'],
  ['BR', 'Brazil'],
  ['CL', 'Chile'],
  ['CO', 'Colombia'],
  ['MX', 'Mexico'],
  ['PE', 'Peru'],
  ['HK', 'Hong Kong'],
  ['IN', 'India'],
  ['ID', 'Indonesia'],
  ['JP', 'Japan'],
  ['KZ', 'Kazakhstan'],
  ['KR', 'South Korea'],
  ['MY', 'Malaysia'],
  ['PH', 'Philippines'],
  ['SG', 'Singapore'],
  ['TW', 'Taiwan'],
  ['TH', 'Thailand'],
  ['VN', 'Vietnam'],
  ['AE', 'United Arab Emirates'],
  ['IL', 'Israel'],
  ['SA', 'Saudi Arabia'],
  ['ZA', 'South Africa']
].map(([code, name]) => ({ code, name }));

const TIMEZONE_REGION_HINTS = new Map([
  ['Europe/Lisbon', 'PT'],
  ['Europe/London', 'GB'],
  ['Europe/Dublin', 'IE'],
  ['Europe/Madrid', 'ES'],
  ['Europe/Paris', 'FR'],
  ['Europe/Berlin', 'DE'],
  ['Europe/Rome', 'IT'],
  ['Europe/Amsterdam', 'NL'],
  ['Europe/Brussels', 'BE'],
  ['Europe/Vienna', 'AT'],
  ['Europe/Stockholm', 'SE'],
  ['Europe/Copenhagen', 'DK'],
  ['Europe/Helsinki', 'FI'],
  ['Europe/Oslo', 'NO'],
  ['Europe/Warsaw', 'PL'],
  ['Europe/Prague', 'CZ'],
  ['America/New_York', 'US'],
  ['America/Chicago', 'US'],
  ['America/Denver', 'US'],
  ['America/Los_Angeles', 'US'],
  ['America/Phoenix', 'US'],
  ['America/Toronto', 'CA'],
  ['America/Vancouver', 'CA'],
  ['America/Sao_Paulo', 'BR'],
  ['America/Mexico_City', 'MX'],
  ['Asia/Tokyo', 'JP'],
  ['Asia/Seoul', 'KR'],
  ['Asia/Taipei', 'TW'],
  ['Asia/Hong_Kong', 'HK'],
  ['Asia/Singapore', 'SG'],
  ['Australia/Sydney', 'AU'],
  ['Australia/Melbourne', 'AU'],
  ['Pacific/Auckland', 'NZ'],
  ['Europe/Bucharest', 'RO'],
  ['Europe/Zurich', 'CH'],
  ['Europe/Budapest', 'HU'],
  ['Europe/Istanbul', 'TR'],
  ['Europe/Athens', 'GR'],
  ['Europe/Belgrade', 'RS'],
  ['Europe/Kiev', 'UA'],
  ['Europe/Riga', 'LV'],
  ['Europe/Tallinn', 'EE'],
  ['Europe/Vilnius', 'LT'],
  ['Europe/Ljubljana', 'SI'],
  ['Europe/Bratislava', 'SK'],
  ['Europe/Sofia', 'BG'],
  ['Europe/Zagreb', 'HR'],
  ['Atlantic/Reykjavik', 'IS'],
  ['Asia/Kolkata', 'IN'],
  ['Asia/Bangkok', 'TH'],
  ['Asia/Manila', 'PH'],
  ['Asia/Ho_Chi_Minh', 'VN'],
  ['Asia/Kuala_Lumpur', 'MY'],
  ['Asia/Jakarta', 'ID'],
  ['Asia/Almaty', 'KZ'],
  ['Asia/Riyadh', 'SA'],
  ['Asia/Dubai', 'AE'],
  ['Asia/Jerusalem', 'IL'],
  ['Africa/Johannesburg', 'ZA'],
  ['America/Buenos_Aires', 'AR'],
  ['America/Santiago', 'CL'],
  ['America/Bogota', 'CO'],
  ['America/Lima', 'PE']
]);

const DETECTED_REGION = detectUserRegion();
const els = {};
const state = {
  products: PRODUCTS,
  regions: buildRegionCatalog(),
  selectedProducts: new Set(DEFAULT_PRODUCTS),
  selectedRegions: new Set([DETECTED_REGION]),
  results: new Map(),
  availability: new Map(),
  discoveryCache: new Map(),
  serviceWorkerRegistration: null,
  timer: null,
  nextCheckAt: null,
  running: false,
  checking: false,
  changeLog: []
};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  loadPreferences();
  loadFromUrl();
  bindEvents();
  registerServiceWorker();
  render();
  if (state.running) {
    resumeWatching();
  } else {
    checkNow({ manual: false });
  }
});

function bindElements() {
  for (const id of [
    'watchState',
    'countryInput',
    'countryDropdown',
    'currentRegionButton',
    'intervalInput',
    'addRegionButton',
    'productGrid',
    'regionGrid',
    'startButton',
    'stopButton',
    'checkButton',
    'notifyButton',
    'testNotifyButton',
    'testSoundButton',
    'availableCount',
    'productCount',
    'regionCount',
    'lastChecked',
    'lastCheckedLabel',
    'baseSteamLink',
    'messageArea',
    'resultsGrid',
    'changelogSection',
    'changelogList',
    'clearLogButton'
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  els.startButton.addEventListener('click', startWatching);
  els.stopButton.addEventListener('click', stopWatching);
  els.checkButton.addEventListener('click', () => checkNow({ manual: true }));
  els.notifyButton.addEventListener('click', requestNotifications);
  els.testNotifyButton.addEventListener('click', testNotification);
  els.testSoundButton.addEventListener('click', testSound);
  els.clearLogButton.addEventListener('click', clearChangelog);
  els.addRegionButton.addEventListener('click', useSelectedCountry);
  els.currentRegionButton.addEventListener('click', useCurrentCountry);
  els.countryInput.addEventListener('input', () => {
    showCountryDropdown(filterCountries(els.countryInput.value));
  });
  els.countryInput.addEventListener('keydown', handleCountryKeydown);
  els.countryInput.addEventListener('blur', () => hideCountryDropdown());

  els.intervalInput.addEventListener('change', () => {
    savePreferences();
    if (state.running) {
      scheduleNextCheck();
    }
  });
}

function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (Array.isArray(stored.selectedProducts) && stored.selectedProducts.length) {
      state.selectedProducts = new Set(stored.selectedProducts.map(normalizeProductId).filter(Boolean));
    }
    if (Array.isArray(stored.selectedRegions) && stored.selectedRegions.length) {
      state.selectedRegions = new Set(stored.selectedRegions.map(normalizeRegion).filter(Boolean));
    }
    if (stored.interval) {
      els.intervalInput.value = String(stored.interval);
    }
    if (stored.running) {
      state.running = true;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  try {
    const log = JSON.parse(localStorage.getItem(CHANGELOG_KEY) || '[]');
    if (Array.isArray(log)) {
      state.changeLog = log;
    }
  } catch {
    localStorage.removeItem(CHANGELOG_KEY);
  }
}

function savePreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    selectedProducts: [...state.selectedProducts],
    selectedRegions: [...state.selectedRegions],
    interval: getInterval(),
    running: state.running
  }));
  updateUrl();
}

function updateUrl() {
  const params = new URLSearchParams();
  if (state.selectedProducts.size) {
    params.set('p', [...state.selectedProducts].join(','));
  }
  if (state.selectedRegions.size) {
    params.set('r', [...state.selectedRegions].join(','));
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

function loadFromUrl() {
  const params = new URLSearchParams(location.search);
  const p = params.get('p');
  const r = params.get('r');
  if (!p && !r) return;
  if (p) {
    const products = p.split(',').map(normalizeProductId).filter(Boolean);
    if (products.length) state.selectedProducts = new Set(products);
  }
  if (r) {
    const regions = r.split(',').map(normalizeRegion).filter(Boolean);
    if (regions.length) state.selectedRegions = new Set(regions);
  }
}

function render() {
  renderControls();
  renderCountrySelect();
  renderProducts();
  renderRegions();
  renderResults();
  updateSummary();
  renderChangelog();
}

function renderControls() {
  const notificationsSupported = canUseNotifications();
  els.watchState.textContent = state.running ? 'Watching' : 'Idle';
  els.watchState.classList.toggle('running', state.running);
  els.startButton.disabled = state.running;
  els.stopButton.disabled = !state.running;
  els.checkButton.disabled = state.checking;
  els.notifyButton.disabled = !notificationsSupported || Notification.permission === 'granted';
  els.notifyButton.textContent = notificationButtonText();
  els.testNotifyButton.disabled = !notificationsSupported || Notification.permission === 'denied';
}

function renderCountrySelect() {
  // Autocomplete dropdown is populated dynamically on input
}

function renderProducts() {
  const fragment = document.createDocumentFragment();
  for (const product of state.products) {
    const label = document.createElement('label');
    label.className = 'select-chip product-chip';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedProducts.has(product.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.selectedProducts.add(product.id);
      } else {
        state.selectedProducts.delete(product.id);
      }
      savePreferences();
      renderResults();
      updateSummary();
    });

    const content = document.createElement('span');
    content.className = 'chip-content';

    if (product.icon) {
      const img = document.createElement('img');
      img.className = 'chip-icon';
      img.src = product.icon;
      img.alt = '';
      img.onerror = () => { img.style.display = 'none'; };
      content.append(img);
    }

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = product.name;

    content.append(name);
    label.append(checkbox, content);
    fragment.append(label);
  }

  els.productGrid.replaceChildren(fragment);
}

function renderRegions() {
  const fragment = document.createDocumentFragment();
  const toShow = state.regions.filter(r => MAJOR_REGIONS.has(r.code) || state.selectedRegions.has(r.code));
  for (const region of toShow) {
    const label = document.createElement('label');
    label.className = 'select-chip';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedRegions.has(region.code);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.selectedRegions.add(region.code);
      } else {
        state.selectedRegions.delete(region.code);
      }
      savePreferences();
      updateSteamLink();
      renderResults();
      updateSummary();
    });

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = `${region.code} - ${region.name}`;

    label.append(checkbox, name);
    fragment.append(label);
  }

  els.regionGrid.replaceChildren(fragment);
}

function renderResults() {
  const productIds = [...state.selectedProducts];
  const regionCodes = [...state.selectedRegions];
  updateSteamLink();

  if (!productIds.length || !regionCodes.length) {
    els.resultsGrid.innerHTML = '<div class="empty-state">Select at least one product and one country.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const regionCode of regionCodes) {
    fragment.append(createRegionCard(regionCode, productIds));
  }

  els.resultsGrid.replaceChildren(fragment);
}

function createRegionCard(regionCode, productIds) {
  const region = getRegion(regionCode);
  const card = document.createElement('article');
  card.className = 'result-card';

  const top = document.createElement('div');
  top.className = 'result-top';
  const title = document.createElement('div');
  title.className = 'region-title';
  const codeEl = document.createElement('span');
  codeEl.className = 'region-code';
  codeEl.textContent = region.code;
  const nameEl = document.createElement('span');
  nameEl.className = 'region-full-name';
  nameEl.textContent = region.name;
  title.append(codeEl, nameEl);
  top.append(title);
  card.append(top);

  for (const productId of productIds) {
    const key = resultKey(productId, regionCode);
    const result = state.results.get(key);
    const product = result ? result.product : getProduct(productId);
    const status = result ? result.status : { state: 'unknown', label: 'Waiting', reason: 'Not checked yet.' };
    const details = primaryDetails(result);
    const pageUrl = result ? result.pageUrl : productPageUrl(product, regionCode);

    const section = document.createElement('div');
    section.className = 'product-section';
    section.innerHTML = `
      <div class="product-section-head">
        <span class="product-section-name">${escapeHtml(product.name)}</span>
        <span class="badge ${escapeHtml(status.state)}">${escapeHtml(status.label)}</span>
      </div>
      <div class="reason">${escapeHtml(status.reason || '')}</div>
      <div class="detail-grid">
        <div class="detail"><span>Inventory</span><span>${formatBoolean(details.inventory_available)}</span></div>
        <div class="detail"><span>Purchasable</span><span>${formatBoolean(details.allow_purchase_in_country)}</span></div>
        <div class="detail"><span>Pending</span><span>${formatBoolean(details.high_pending_orders)}</span></div>
        <div class="detail"><span>Packages</span><span>${escapeHtml(formatPackageCount(result))}</span></div>
        <div class="detail"><span>Delivery</span><span>${escapeHtml(formatDelivery(details))}</span></div>
        <div class="detail"><span>Checked</span><span>${escapeHtml(result ? formatTime(result.checkedAt) : 'Never')}</span></div>
      </div>
      ${renderPackageModels(result)}
      <div class="card-actions">
        <a href="${escapeAttribute(pageUrl)}" target="_blank" rel="noreferrer">Steam page</a>
      </div>
    `;
    card.append(section);
  }

  if (KOMODO_REGIONS.has(regionCode)) {
    for (const productId of productIds) {
      if (!KOMODO_CATALOG[productId]) continue;
      const key = komodoResultKey(productId, regionCode);
      const result = state.results.get(key);
      const product = result ? result.product : getProduct(productId);
      const status = result
        ? result.status
        : { state: 'unknown', label: 'Waiting', reason: 'Not checked yet.' };
      const pageUrl = `${KOMODO_ORIGIN}${KOMODO_CATALOG[productId].path}`;

      const section = document.createElement('div');
      section.className = 'product-section';
      section.innerHTML = `
        <div class="product-section-head">
          <span class="product-section-name">${escapeHtml(product.name)} <span class="source-tag">Komodo</span></span>
          <span class="badge ${escapeHtml(status.state)}">${escapeHtml(status.label)}</span>
        </div>
        <div class="reason">${escapeHtml(status.reason || '')}</div>
        ${renderPackageModels(result)}
        <div class="card-actions">
          <a href="${escapeAttribute(pageUrl)}" target="_blank" rel="noreferrer">Komodo page</a>
        </div>
      `;
      card.append(section);
    }
  }

  return card;
}

function createResultCard(productId, regionCode, result) {
  const product = result ? result.product : getProduct(productId);
  const region = getRegion(regionCode);
  const status = result ? result.status : {
    state: 'unknown',
    label: 'Waiting',
    reason: 'Not checked yet.'
  };
  const details = primaryDetails(result);
  const card = document.createElement('article');
  card.className = 'result-card';

  card.innerHTML = `
    <div class="result-top">
      <div class="region-title">
        <span class="region-code">${escapeHtml(product.name)}</span>
        <span class="region-full-name">${escapeHtml(region.code)} - ${escapeHtml(region.name)}</span>
      </div>
      <span class="badge ${escapeHtml(status.state)}">${escapeHtml(status.label)}</span>
    </div>
    <div class="reason">${escapeHtml(status.reason)}</div>
    <div class="detail-grid">
      <div class="detail"><span>Inventory</span><span>${formatBoolean(details.inventory_available)}</span></div>
      <div class="detail"><span>Purchasable</span><span>${formatBoolean(details.allow_purchase_in_country)}</span></div>
      <div class="detail"><span>Pending</span><span>${formatBoolean(details.high_pending_orders)}</span></div>
      <div class="detail"><span>Packages</span><span>${escapeHtml(formatPackageCount(result))}</span></div>
      <div class="detail"><span>Delivery</span><span>${escapeHtml(formatDelivery(details))}</span></div>
      <div class="detail"><span>Checked</span><span>${escapeHtml(result ? formatTime(result.checkedAt) : 'Never')}</span></div>
    </div>
    ${renderPackageModels(result)}
    <div class="card-actions">
      <a href="${escapeAttribute(result ? result.pageUrl : productPageUrl(product, regionCode))}" target="_blank" rel="noreferrer">Steam page</a>
    </div>
  `;

  return card;
}

function updateSummary() {
  const productIds = [...state.selectedProducts];
  const regionCodes = [...state.selectedRegions];
  const selectedKeys = productIds.flatMap((productId) =>
    regionCodes.flatMap((regionCode) => {
      const keys = [resultKey(productId, regionCode)];
      if (KOMODO_CATALOG[productId] && KOMODO_REGIONS.has(regionCode)) {
        keys.push(komodoResultKey(productId, regionCode));
      }
      return keys;
    })
  );
  const results = selectedKeys.map((key) => state.results.get(key)).filter(Boolean);
  const available = results.filter((result) => result.status && result.status.found).length;
  const latest = results
    .map((result) => Date.parse(result.checkedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  els.availableCount.textContent = String(available);
  els.productCount.textContent = String(productIds.length);
  els.regionCount.textContent = String(regionCodes.length);
  if (!state.running) {
    els.lastChecked.textContent = latest ? formatTime(new Date(latest).toISOString()) : 'Never';
    els.lastCheckedLabel.textContent = 'last check';
  }

  if (available > 0) {
    document.title = `⚡ ${available} in stock - Steam hardware stock`;
  } else if (state.running) {
    document.title = 'Watching - Steam hardware stock';
  } else {
    document.title = ORIGINAL_TITLE;
  }
}

async function startWatching() {
  if (!state.selectedProducts.size || !state.selectedRegions.size) {
    setMessage('Select at least one product and one country.');
    return;
  }

  unlockAudio();

  if (canUseNotifications() && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => {});
  }

  state.running = true;
  savePreferences();
  renderControls();
  await checkNow({ manual: false });
  scheduleNextCheck();
}

function stopWatching() {
  state.running = false;
  stopCountdown();
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  savePreferences();
  renderControls();
  updateSummary();
  updateSummary();
}

async function resumeWatching() {
  if (!state.selectedProducts.size || !state.selectedRegions.size) {
    state.running = false;
    savePreferences();
    return;
  }
  renderControls();
  await checkNow({ manual: false });
  scheduleNextCheck();
}

function scheduleNextCheck() {
  if (state.timer) {
    clearTimeout(state.timer);
  }

  if (!state.running) {
    return;
  }

  const delay = getInterval() * 1000;
  state.nextCheckAt = Date.now() + delay;
  startCountdown();

  state.timer = setTimeout(async () => {
    await checkNow({ manual: false });
    scheduleNextCheck();
  }, delay);
}

function startCountdown() {
  stopCountdown();
  tickCountdown();
  countdownInterval = setInterval(tickCountdown, 1000);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function tickCountdown() {
  if (!state.running) {
    stopCountdown();
    return;
  }
  if (state.checking) {
    els.lastChecked.textContent = '...';
    els.lastCheckedLabel.textContent = 'checking';
    return;
  }
  const remaining = Math.max(0, Math.ceil((state.nextCheckAt - Date.now()) / 1000));
  els.lastChecked.textContent = remaining > 0 ? `${remaining}s` : '...';
  els.lastCheckedLabel.textContent = 'next check';
}

async function checkNow({ manual }) {
  if (state.checking) {
    return;
  }

  const products = [...state.selectedProducts].map(getProduct).filter(Boolean);
  const regions = [...state.selectedRegions];
  if (!products.length || !regions.length) {
    setMessage('Select at least one product and one country.');
    return;
  }

  state.checking = true;
  setMessage('Checking...');
  renderControls();

  const checks = products.flatMap((product) => regions.map((region) => ({ product, region })));

  const komodoChecks = [];
  for (const { id: productId } of products) {
    if (!KOMODO_CATALOG[productId]) continue;
    for (const region of regions) {
      if (!KOMODO_REGIONS.has(region)) continue;
      komodoChecks.push(checkKomodoProductRegion(productId, region));
    }
  }

  try {
    const [steamResults, komodoSettled] = await Promise.all([
      Promise.all(checks.map(async ({ product, region }) => {
        try {
          return await checkProductRegion(product, region);
        } catch (error) {
          return {
            product: publicProduct(product, region),
            region,
            pageUrl: productPageUrl(product, region),
            checkedAt: new Date().toISOString(),
            packageCount: 0,
            packages: [],
            status: {
              found: false,
              state: 'error',
              label: 'Error',
              reason: error.message
            }
          };
        }
      })),
      Promise.allSettled(komodoChecks)
    ]);

    for (const result of steamResults) {
      state.results.set(resultKey(result.product.id, result.region), result);
      maybeNotify(result, manual);
    }

    for (const settled of komodoSettled) {
      if (settled.status === 'fulfilled') {
        const result = settled.value;
        state.results.set(komodoResultKey(result.product.id, result.region), result);
        maybeNotify(result, manual);
      }
    }

    setMessage('');
  } finally {
    state.checking = false;
    render();
  }
}

async function checkProductRegion(product, region) {
  const discovery = await discoverProduct(product, region);

  if (!discovery.packageIds.length) {
    return {
      product: publicProduct(product, region),
      region,
      pageUrl: discovery.pageUrl,
      checkedAt: new Date().toISOString(),
      discovery,
      packageCount: 0,
      packages: [],
      status: classifyProductPackages([])
    };
  }

  const { apiUrl, details } = await fetchHardwareItems(region, discovery.packageIds);
  const packages = discovery.packageIds.map((packageId) => {
    const detail = details.find((item) => Number(item.packageid) === packageId) || null;
    return {
      packageId,
      label: discovery.packageLabels[String(packageId)] || null,
      status: classifyHardwareDetails(detail),
      details: detail
    };
  });

  return {
    product: publicProduct(product, region),
    region,
    pageUrl: discovery.pageUrl,
    apiUrl,
    checkedAt: new Date().toISOString(),
    discovery,
    packageCount: discovery.packageIds.length,
    packages,
    status: classifyProductPackages(packages)
  };
}

async function checkKomodoProductRegion(productId, region) {
  const entry = KOMODO_CATALOG[productId];
  const pageUrl = `${KOMODO_ORIGIN}${entry.path}`;
  const product = getProduct(productId);
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`/proxy?url=${encodeURIComponent(pageUrl)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    const packages = entry.models
      ? parseKomodoModels(html, entry.models)
      : [parseKomodoSingle(html)];

    return {
      source: 'komodo',
      product: { id: productId, name: product ? product.name : productId, pageUrl },
      region,
      pageUrl,
      checkedAt,
      packageCount: packages.length,
      packages,
      status: classifyProductPackages(packages)
    };
  } catch (error) {
    return {
      source: 'komodo',
      product: { id: productId, name: product ? product.name : productId, pageUrl },
      region,
      pageUrl,
      checkedAt,
      packageCount: 0,
      packages: [],
      status: { found: false, state: 'error', label: 'Error', reason: `Could not reach Komodo Station: ${error.message}` }
    };
  }
}

function parseKomodoModels(html, models) {
  return models.map(({ label, selector }) => {
    const re = new RegExp(`class="[^"]*${selector}[^"]*"([\\s\\S]{0,3000}?)(?=class="[^"]*pa_models_|<\\/ul|$)`);
    const match = re.exec(html);
    const section = match ? match[1] : '';
    const inStock = section ? section.includes('在庫あり') : html.includes('在庫あり');
    return {
      packageId: `komodo-${selector}`,
      label,
      status: inStock
        ? { found: true, state: 'available', label: 'In stock', reason: 'Komodo Station reports inventory available.' }
        : { found: false, state: 'out', label: 'Out of stock', reason: 'Komodo Station reports sold out.' }
    };
  });
}

function parseKomodoSingle(html) {
  const inStock = html.includes('在庫あり');
  return {
    packageId: 'komodo-single',
    label: null,
    status: inStock
      ? { found: true, state: 'available', label: 'In stock', reason: 'Komodo Station reports inventory available.' }
      : { found: false, state: 'out', label: 'Out of stock', reason: 'Komodo Station reports sold out.' }
  };
}

async function discoverProduct(product, region) {
  const cacheKey = `${product.id}:${region}`;
  const cached = state.discoveryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < DISCOVERY_CACHE_MS) {
    return cached.value;
  }

  let bestDiscovery = null;
  const errors = [];

  for (const productPath of product.paths) {
    const pageUrl = productPageUrl(product, region, productPath);

    try {
      const html = await fetchSteamText(pageUrl);
      const config = parseJsonAttribute(html, 'data-config') || {};
      const partnerEventStore = parseJsonAttribute(html, 'data-partnereventstore') || [];
      const metadata = collectReservationMetadata(partnerEventStore);
      const packageIds = metadata.packageIds.length ? metadata.packageIds : [...product.fallbackPackageIds];
      const appIds = metadata.appIds.length ? metadata.appIds : [...product.fallbackAppIds];
      const packageLabels = { ...metadata.packageLabels };
      const discovery = {
        product: publicProduct(product, region),
        region,
        pageUrl,
        pageTitle: extractTitle(html),
        countryFromPage: config.COUNTRY || null,
        packageIds,
        packageLabels,
        appIds,
        source: metadata.packageIds.length
          ? 'page-reservation-widget'
          : (packageIds.length ? 'fallback-product-registry' : 'page-no-package'),
        widgetCount: metadata.widgetCount,
        checkedAt: new Date().toISOString()
      };

      if (!bestDiscovery || discovery.packageIds.length) {
        bestDiscovery = discovery;
      }

      if (discovery.packageIds.length) {
        break;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (!bestDiscovery && product.fallbackPackageIds.length) {
    bestDiscovery = {
      product: publicProduct(product, region),
      region,
      pageUrl: productPageUrl(product, region),
      pageTitle: product.name,
      countryFromPage: null,
      packageIds: [...product.fallbackPackageIds],
      packageLabels: {},
      appIds: [...product.fallbackAppIds],
      source: 'fallback-after-page-error',
      widgetCount: 0,
      checkedAt: new Date().toISOString(),
      discoveryErrors: errors
    };
  }

  if (!bestDiscovery) {
    throw new Error(errors[0] || 'No Steam product page could be fetched.');
  }

  state.discoveryCache.set(cacheKey, {
    cachedAt: Date.now(),
    value: bestDiscovery
  });

  return bestDiscovery;
}

async function fetchHardwareItems(region, packageIds) {
  const input = {
    packageid: packageIds,
    context: {
      country_code: region,
      language: 'english'
    }
  };

  const apiUrl = new URL(STEAM_HARDWARE_API);
  apiUrl.searchParams.set('input_json', JSON.stringify(input));
  const payload = await fetchSteamJson(apiUrl.toString());
  const details = payload && payload.response && Array.isArray(payload.response.details)
    ? payload.response.details
    : [];

  return {
    apiUrl: apiUrl.toString(),
    details
  };
}

async function fetchSteamText(url) {
  return fetchReadableSteamData(url, 'text');
}

async function fetchSteamJson(url) {
  return fetchReadableSteamData(url, 'json');
}

async function fetchReadableSteamData(url, responseType) {
  const attempts = buildFetchAttempts(url);
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (attempt.requiresTrackerProxyHeader && response.headers.get('x-steam-tracker-proxy') !== '1') {
        throw new Error('same-origin proxy unavailable');
      }
      return responseType === 'json' ? response.json() : response.text();
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError ? lastError.message : 'request failed';
  throw new Error(`Browser could not read Steam data (${reason}). Steam does not allow direct browser reads from arbitrary sites, so this deployment needs a small allowlisted proxy.`);
}

function buildFetchAttempts(url) {
  const attempts = [];
  const config = window.STEAM_TRACKER_CONFIG || {};
  const configuredTemplate = typeof config.proxyTemplate === 'string' ? config.proxyTemplate.trim() : '';

  if (configuredTemplate) {
    attempts.push({
      url: applyProxyTemplate(configuredTemplate, url)
    });
  }

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    attempts.push({
      url: `/proxy?url=${encodeURIComponent(url)}`,
      requiresTrackerProxyHeader: true
    });
  }

  attempts.push({ url });

  return [...new Map(attempts.map((attempt) => [attempt.url, attempt])).values()];
}

function applyProxyTemplate(template, url) {
  if (template.includes('{url}')) {
    return template.replace('{url}', encodeURIComponent(url));
  }
  return `${template}${encodeURIComponent(url)}`;
}

async function requestNotifications() {
  try {
    const granted = await ensureNotificationPermission();
    if (granted) {
      await notify('Steam hardware tracker', 'Browser notifications are enabled.');
    }
  } catch (error) {
    setMessage(`Notification failed: ${error.message}`);
  } finally {
    renderControls();
  }
}

function testSound() {
  unlockAudio();
  playAlertSound();
}

async function testNotification() {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      return;
    }
    setMessage('Sending test notification...');
    const sent = await notify('Steam hardware tracker', 'Test notification from the local stock tracker.');
    if (!sent) {
      setMessage('Notification could not be sent. Check browser or OS notification settings.');
    }
  } catch (error) {
    setMessage(`Notification failed: ${error.message}`);
  } finally {
    renderControls();
  }
}

function maybeNotify(result, manual) {
  const key = getResultKey(result);
  const isAvailable = Boolean(result.status && result.status.found);
  const wasAvailable = state.availability.get(key) === true;
  const hadPriorReading = state.availability.has(key);
  state.availability.set(key, isAvailable);

  if (hadPriorReading && isAvailable !== wasAvailable) {
    logChange(result, isAvailable);
  }

  if (!isAvailable || wasAvailable) {
    return;
  }

  playAlertSound();

  if (!canUseNotifications() || Notification.permission !== 'granted') {
    return;
  }

  const suffix = manual ? 'Found during manual check.' : 'Found during watch cycle.';
  void notify(
    `${result.product.name} in stock: ${result.region}`,
    `${result.status.reason} ${suffix}`,
    result.pageUrl
  ).catch((error) => setMessage(error.message));
}

function logChange(result, isAvailable) {
  state.changeLog.unshift({
    ts: new Date().toISOString(),
    productName: result.product.name,
    region: result.region,
    available: isAvailable,
    label: result.status.label
  });
  if (state.changeLog.length > CHANGELOG_MAX) {
    state.changeLog.length = CHANGELOG_MAX;
  }
  localStorage.setItem(CHANGELOG_KEY, JSON.stringify(state.changeLog));
}

function clearChangelog() {
  state.changeLog = [];
  localStorage.removeItem(CHANGELOG_KEY);
  renderChangelog();
}

function renderChangelog() {
  els.changelogSection.hidden = false;

  if (!state.changeLog.length) {
    els.changelogList.innerHTML = '<div class="empty-state">No changes logged yet. Status transitions are recorded while watching.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of state.changeLog) {
    const el = document.createElement('div');
    el.className = 'changelog-entry';

    const time = document.createElement('span');
    time.className = 'changelog-time';
    time.textContent = formatTime(entry.ts);

    const product = document.createElement('span');
    product.className = 'changelog-product';
    product.textContent = entry.productName;

    const region = document.createElement('span');
    region.className = 'changelog-region';
    region.textContent = entry.region;

    const badge = document.createElement('span');
    badge.className = `badge ${entry.available ? 'available' : 'out'}`;
    badge.textContent = entry.label;

    el.append(time, product, region, badge);
    fragment.appendChild(el);
  }

  els.changelogList.replaceChildren(fragment);
}

async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    setMessage('Notifications are not supported by this browser.');
    return false;
  }

  if (!window.isSecureContext) {
    setMessage('Notifications require localhost or HTTPS.');
    return false;
  }

  if (Notification.permission === 'denied') {
    setMessage('Notifications are blocked for this site in the browser.');
    return false;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setMessage('Notification permission was not granted.');
      return false;
    }
  }

  return true;
}

function canUseNotifications() {
  return 'Notification' in window && window.isSecureContext;
}

function unlockAudio() {
  if (audioContext) {
    return;
  }
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    // Audio not supported in this browser.
  }
}

function playAlertSound() {
  if (!audioContext) {
    return;
  }
  const ctx = audioContext;
  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    const now = ctx.currentTime;
    for (const [offset, freq] of [[0, 880], [0.25, 1100]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    }
  }).catch(() => {});
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return null;
  }

  try {
    await navigator.serviceWorker.register('/sw.js');
    state.serviceWorkerRegistration = await navigator.serviceWorker.ready;
    return state.serviceWorkerRegistration;
  } catch {
    state.serviceWorkerRegistration = false;
    return null;
  }
}

async function getServiceWorkerRegistration() {
  if (state.serviceWorkerRegistration) {
    return state.serviceWorkerRegistration;
  }

  if (state.serviceWorkerRegistration === false) {
    return null;
  }

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return null;
  }

  try {
    state.serviceWorkerRegistration = await navigator.serviceWorker.ready;
    return state.serviceWorkerRegistration;
  } catch {
    return registerServiceWorker();
  }
}

async function notify(title, body, url) {
  if (!canUseNotifications() || Notification.permission !== 'granted') {
    return false;
  }

  const options = {
    body,
    tag: url || title,
    renotify: true,
    requireInteraction: true,
    data: {
      url: url || window.location.href
    }
  };

  const registration = await getServiceWorkerRegistration();
  if (registration && registration.active && typeof registration.showNotification === 'function') {
    try {
      await registration.showNotification(title, options);
      setMessage('Notification sent.');
      return true;
    } catch (error) {
      if (error && error.message) {
        options._serviceWorkerError = error.message;
      }
    }
  }

  try {
    const notification = new Notification(title, options);
    if (url) {
      notification.onclick = () => {
        window.focus();
        window.open(url, '_blank', 'noopener');
      };
    }
    setMessage('Notification sent.');
    return true;
  } catch (error) {
    setMessage(`Notification failed: ${error.message}`);
    return false;
  }
}

function filterCountries(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return state.regions.filter(r =>
    r.name.toLowerCase().includes(q) || r.code.toLowerCase().startsWith(q)
  ).slice(0, 8);
}

function showCountryDropdown(results) {
  acIndex = -1;
  if (!results.length) { hideCountryDropdown(); return; }
  const frag = document.createDocumentFragment();
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'country-option';
    div.textContent = `${r.name} (${r.code})`;
    div.dataset.code = r.code;
    div.addEventListener('mousedown', e => {
      e.preventDefault();
      addCountryToSelection(r.code);
    });
    frag.append(div);
  }
  els.countryDropdown.replaceChildren(frag);
  els.countryDropdown.classList.add('open');
}

function hideCountryDropdown() {
  els.countryDropdown.classList.remove('open');
  acIndex = -1;
}

function handleCountryKeydown(e) {
  const options = [...els.countryDropdown.querySelectorAll('.country-option')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, options.length - 1);
    options.forEach((o, i) => o.classList.toggle('active', i === acIndex));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, -1);
    options.forEach((o, i) => o.classList.toggle('active', i === acIndex));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const active = options[acIndex] ?? options[0];
    if (active) addCountryToSelection(active.dataset.code);
    else useSelectedCountry();
  } else if (e.key === 'Escape') {
    hideCountryDropdown();
  }
}

function addCountryToSelection(code) {
  const normalized = normalizeRegion(code);
  if (!normalized) return;
  state.selectedRegions.add(normalized);
  els.countryInput.value = '';
  hideCountryDropdown();
  setMessage('');
  savePreferences();
  render();
}

function useSelectedCountry() {
  const val = els.countryInput.value.trim();
  if (!val) return;
  let code = normalizeRegion(val.toUpperCase());
  if (!code) {
    const m = val.match(/\(([A-Z]{2})\)\s*$/);
    if (m) code = normalizeRegion(m[1]);
  }
  if (!code) {
    const results = filterCountries(val);
    if (results.length) code = results[0].code;
  }
  if (!code) {
    setMessage('Country not found. Type and select from the list.');
    return;
  }
  addCountryToSelection(code);
}

function useCurrentCountry() {
  addCountryToSelection(DETECTED_REGION);
}

function classifyHardwareDetails(details) {
  if (!details) {
    return {
      found: false,
      state: 'unknown',
      label: 'Unknown',
      reason: 'Steam did not return hardware details for this package.'
    };
  }

  if (details.account_restricted_from_purchasing) {
    return {
      found: false,
      state: 'restricted',
      label: 'Restricted',
      reason: 'Purchasing is restricted for this account or context.'
    };
  }

  if (details.allow_purchase_in_country === false) {
    return {
      found: false,
      state: 'unsupported',
      label: 'Not sold',
      reason: 'Steam reports this hardware is not purchasable in the selected country.'
    };
  }

  if (details.inventory_available) {
    return {
      found: true,
      state: 'available',
      label: 'In stock',
      reason: 'Steam reports inventory is available for this country.'
    };
  }

  if (details.requires_reservation) {
    return {
      found: false,
      state: 'reservation',
      label: 'Reservation',
      reason: 'Steam reports reservation is required.'
    };
  }

  if (details.high_pending_orders) {
    return {
      found: false,
      state: 'pending',
      label: 'Out of stock',
      reason: 'Steam reports high pending orders and no available inventory.'
    };
  }

  return {
    found: false,
    state: 'out',
    label: 'Out of stock',
    reason: 'Steam does not report available inventory.'
  };
}

function classifyProductPackages(packages) {
  if (!packages.length) {
    return {
      found: false,
      state: 'unpublished',
      label: 'No package yet',
      reason: 'Steam has a product page, but no stock-checkable hardware package is published yet.'
    };
  }

  const available = packages.find((item) => item.status.found);
  if (available) {
    return {
      found: true,
      state: 'available',
      label: 'In stock',
      reason: packages.length > 1
        ? `Steam reports ${formatPackageName(available)} has inventory available.`
        : available.status.reason
    };
  }

  const priority = ['reservation', 'pending', 'out', 'unsupported', 'restricted', 'unknown'];
  for (const stateName of priority) {
    const match = packages.find((item) => item.status.state === stateName);
    if (match) {
      return {
        found: false,
        state: match.status.state,
        label: match.status.label,
        reason: packages.length > 1
          ? `Steam reports ${match.status.label.toLowerCase()} for ${formatPackageName(match)}.`
          : match.status.reason
      };
    }
  }

  return {
    found: false,
    state: 'unknown',
    label: 'Unknown',
    reason: 'Steam returned hardware packages, but no known inventory state.'
  };
}

function collectReservationMetadata(partnerEventStore) {
  const packageIds = new Set();
  const appIds = new Set();
  const packageLabels = {};
  const events = Array.isArray(partnerEventStore) ? partnerEventStore : [];
  let widgetCount = 0;

  for (const event of events) {
    let jsonData = event && event.jsondata;
    if (typeof jsonData === 'string') {
      try {
        jsonData = JSON.parse(jsonData);
      } catch {
        continue;
      }
    }

    const sections = jsonData && Array.isArray(jsonData.sale_sections) ? jsonData.sale_sections : [];
    for (const section of sections) {
      const internalData = section && section.internal_section_data;
      if (!internalData || internalData.internal_type !== 'reservation_widget') {
        continue;
      }

      widgetCount += 1;
      const appId = Number(internalData.reservation_appid_wishlist);
      if (Number.isInteger(appId) && appId > 0) {
        appIds.add(appId);
      }

      const options = Array.isArray(internalData.reservation_options) ? internalData.reservation_options : [];
      for (const option of options) {
        const packageId = Number(option && option.reservation_package);
        if (Number.isInteger(packageId) && packageId > 0) {
          packageIds.add(packageId);
          const label = extractReservationOptionLabel(option);
          if (label) {
            packageLabels[String(packageId)] = label;
          }
        }
      }
    }
  }

  return {
    packageIds: [...packageIds],
    appIds: [...appIds],
    packageLabels,
    widgetCount
  };
}

function extractReservationOptionLabel(option) {
  const descriptions = Array.isArray(option && option.localized_reservation_desc)
    ? option.localized_reservation_desc
    : [];
  const description = descriptions[0] || descriptions.find(Boolean) || '';
  const match = /\[classname=skutype\]([\s\S]*?)\[\/classname\]/i.exec(description);
  return match ? stripSteamMarkup(match[1]) : null;
}

function stripSteamMarkup(value) {
  return String(value || '')
    .replace(/\[\/?[^\]]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonAttribute(html, attributeName) {
  const doubleQuoted = new RegExp(`${attributeName}="([^"]*)"`, 'i').exec(html);
  if (doubleQuoted) {
    return JSON.parse(decodeHtmlAttribute(doubleQuoted[1]));
  }

  const singleQuoted = new RegExp(`${attributeName}='([^']*)'`, 'i').exec(html);
  if (singleQuoted) {
    return JSON.parse(decodeHtmlAttribute(singleQuoted[1]));
  }

  return null;
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTitle(html) {
  const match = /<title>([^<]+)/i.exec(html);
  return match ? match[1].trim() : null;
}

function buildRegionCatalog() {
  const seen = new Set();
  const regions = [];
  const detected = COMMON_REGIONS.find((region) => region.code === DETECTED_REGION) || {
    code: DETECTED_REGION,
    name: DETECTED_REGION
  };

  for (const region of [detected, ...COMMON_REGIONS]) {
    if (!seen.has(region.code)) {
      seen.add(region.code);
      regions.push(region);
    }
  }

  return regions;
}

function detectUserRegion() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hinted = TIMEZONE_REGION_HINTS.get(timeZone);
    if (hinted) {
      return hinted;
    }
  } catch {
    // Ignore unavailable timezone APIs.
  }

  const languageRegions = [];
  const languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];

  for (const language of languages) {
    try {
      const region = new Intl.Locale(language).region;
      if (region) {
        languageRegions.push(region.toUpperCase());
      }
    } catch {
      const match = /[-_]([A-Za-z]{2})\b/.exec(language || '');
      if (match) {
        languageRegions.push(match[1].toUpperCase());
      }
    }
  }

  const supportedFromLanguage = languageRegions.find((region) => COMMON_REGIONS.some((item) => item.code === region));
  if (supportedFromLanguage) {
    return supportedFromLanguage;
  }

  return 'US';
}

function publicProduct(product, region) {
  return {
    id: product.id,
    name: product.name,
    pageUrl: productPageUrl(product, region)
  };
}

function getProduct(id) {
  const productId = normalizeProductId(id);
  return state.products.find((product) => product.id === productId) || null;
}

function getRegion(code) {
  return state.regions.find((region) => region.code === code) || { code, name: code };
}

function primaryDetails(result) {
  if (!result || !Array.isArray(result.packages)) {
    return {};
  }

  const available = result.packages.find((item) => item.status && item.status.found);
  const firstWithDetails = result.packages.find((item) => item.details);
  return (available && available.details) || (firstWithDetails && firstWithDetails.details) || {};
}

function renderPackageModels(result) {
  if (!result || !Array.isArray(result.packages) || result.packages.length <= 1) {
    return '';
  }

  const rows = result.packages.map((item) => {
    const status = item.status || {
      state: 'unknown',
      label: 'Unknown'
    };
    return `
      <div class="model-row">
        <span class="model-name">${escapeHtml(formatPackageName(item))}</span>
        <span class="model-delivery">${escapeHtml(formatDelivery(item.details || {}))}</span>
        <span class="model-status badge ${escapeHtml(status.state)}">${escapeHtml(status.label)}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="model-list" aria-label="Hardware options">
      ${rows}
    </div>
  `;
}

function formatPackageName(item) {
  return item && item.label ? item.label : `Package ${item.packageId}`;
}

function productPageUrl(product, region, productPath = product.paths[0]) {
  const url = new URL(productPath, STEAM_ORIGIN);
  url.searchParams.set('cc', region);
  url.searchParams.set('l', 'english');
  return url.toString();
}

function updateSteamLink() {
  const firstProduct = getProduct([...state.selectedProducts][0]) || state.products[0];
  const firstRegion = [...state.selectedRegions][0] || DETECTED_REGION;
  els.baseSteamLink.href = productPageUrl(firstProduct, firstRegion);
}

function formatPackageCount(result) {
  if (!result) {
    return 'Unknown';
  }
  if (!result.packageCount) {
    return 'Not published';
  }
  if (Array.isArray(result.packages) && result.packages.filter((item) => item.label).length > 1) {
    return `${result.packageCount} models`;
  }
  return result.packageCount === 1 ? 'Published' : `${result.packageCount} options`;
}

function getInterval() {
  const parsed = Number.parseInt(els.intervalInput.value, 10);
  return Number.isInteger(parsed) && parsed >= 30 ? parsed : 60;
}

function normalizeRegion(value) {
  const region = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(region) ? region : null;
}

function normalizeProductId(value) {
  const product = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return product || null;
}

function notificationButtonText() {
  if (!('Notification' in window)) {
    return 'Notifications unavailable';
  }
  if (!window.isSecureContext) {
    return 'HTTPS required';
  }
  if (Notification.permission === 'granted') {
    return 'Notifications enabled';
  }
  if (Notification.permission === 'denied') {
    return 'Notifications blocked';
  }
  return 'Enable notifications';
}

function resultKey(productId, regionCode) {
  return `${productId}:${regionCode}`;
}

function komodoResultKey(productId, regionCode) {
  return `komodo:${productId}:${regionCode}`;
}

function getResultKey(result) {
  return result.source === 'komodo'
    ? komodoResultKey(result.product.id, result.region)
    : resultKey(result.product.id, result.region);
}

function formatBoolean(value) {
  if (value === true) {
    return 'Yes';
  }
  if (value === false) {
    return 'No';
  }
  return 'Unknown';
}

function formatDelivery(details) {
  const soonest = details.estimated_delivery_soonest_business_days;
  const latest = details.estimated_delivery_latest_business_days;
  if (Number.isFinite(soonest) && Number.isFinite(latest)) {
    return `${soonest}-${latest} business days`;
  }
  return 'Unknown';
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Never';
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function setMessage(message) {
  els.messageArea.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
