'use strict';

const STEAM_ORIGIN = 'https://store.steampowered.com';
const STEAM_HARDWARE_API = 'https://api.steampowered.com/IStoreBrowseService/GetHardwareItems/v1/';
const DISCOVERY_CACHE_MS = 60 * 1000;
const DEFAULT_PRODUCTS = ['steam-controller'];
const STORAGE_KEY = 'steam-hardware-stock-tracker-v3';

const PRODUCTS = [
  {
    id: 'steam-controller',
    name: 'Steam Controller',
    paths: ['/hardware/steamcontroller/', '/sale/steamcontroller'],
    fallbackPackageIds: [1558609],
    fallbackAppIds: [4165870]
  },
  {
    id: 'steam-deck',
    name: 'Steam Deck',
    paths: ['/steamdeck/'],
    fallbackPackageIds: [],
    fallbackAppIds: [1675200]
  },
  {
    id: 'steam-frame',
    name: 'Steam Frame',
    paths: ['/hardware/steamframe/', '/sale/steamframe'],
    fallbackPackageIds: [],
    fallbackAppIds: []
  },
  {
    id: 'steam-machine',
    name: 'Steam Machine',
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
  ['PT', 'Portugal'],
  ['ES', 'Spain'],
  ['FR', 'France'],
  ['DE', 'Germany'],
  ['IT', 'Italy'],
  ['NL', 'Netherlands'],
  ['BE', 'Belgium'],
  ['AT', 'Austria'],
  ['SE', 'Sweden'],
  ['DK', 'Denmark'],
  ['FI', 'Finland'],
  ['NO', 'Norway'],
  ['PL', 'Poland'],
  ['CZ', 'Czechia'],
  ['AU', 'Australia'],
  ['NZ', 'New Zealand'],
  ['JP', 'Japan'],
  ['KR', 'South Korea'],
  ['TW', 'Taiwan'],
  ['HK', 'Hong Kong'],
  ['SG', 'Singapore'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico']
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
  ['Pacific/Auckland', 'NZ']
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
  running: false,
  checking: false
};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  loadPreferences();
  bindEvents();
  registerServiceWorker();
  render();
  checkNow({ manual: false });
});

function bindElements() {
  for (const id of [
    'watchState',
    'countrySelect',
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
    'availableCount',
    'productCount',
    'regionCount',
    'lastChecked',
    'baseSteamLink',
    'messageArea',
    'resultsGrid'
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
  els.addRegionButton.addEventListener('click', useSelectedCountry);
  els.currentRegionButton.addEventListener('click', useCurrentCountry);
  els.countrySelect.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      useSelectedCountry();
    }
  });

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
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function savePreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    selectedProducts: [...state.selectedProducts],
    selectedRegions: [...state.selectedRegions],
    interval: getInterval()
  }));
}

function render() {
  renderControls();
  renderCountrySelect();
  renderProducts();
  renderRegions();
  renderResults();
  updateSummary();
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
  const selected = [...state.selectedRegions][0] || DETECTED_REGION;
  const fragment = document.createDocumentFragment();

  for (const region of state.regions) {
    const option = document.createElement('option');
    option.value = region.code;
    option.textContent = `${region.name} (${region.code})`;
    fragment.append(option);
  }

  els.countrySelect.replaceChildren(fragment);
  els.countrySelect.value = selected;
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

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = product.name;

    label.append(checkbox, name);
    fragment.append(label);
  }

  els.productGrid.replaceChildren(fragment);
}

function renderRegions() {
  const fragment = document.createDocumentFragment();
  for (const region of state.regions) {
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
  for (const productId of productIds) {
    for (const regionCode of regionCodes) {
      const key = resultKey(productId, regionCode);
      fragment.append(createResultCard(productId, regionCode, state.results.get(key)));
    }
  }

  els.resultsGrid.replaceChildren(fragment);
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
  const selectedKeys = productIds.flatMap((productId) => regionCodes.map((regionCode) => resultKey(productId, regionCode)));
  const results = selectedKeys.map((key) => state.results.get(key)).filter(Boolean);
  const available = results.filter((result) => result.status && result.status.found).length;
  const latest = results
    .map((result) => Date.parse(result.checkedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  els.availableCount.textContent = String(available);
  els.productCount.textContent = String(productIds.length);
  els.regionCount.textContent = String(regionCodes.length);
  els.lastChecked.textContent = latest ? formatTime(new Date(latest).toISOString()) : 'Never';
}

async function startWatching() {
  if (!state.selectedProducts.size || !state.selectedRegions.size) {
    setMessage('Select at least one product and one country.');
    return;
  }

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
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  renderControls();
}

function scheduleNextCheck() {
  if (state.timer) {
    clearTimeout(state.timer);
  }

  if (!state.running) {
    return;
  }

  state.timer = setTimeout(async () => {
    await checkNow({ manual: false });
    scheduleNextCheck();
  }, getInterval() * 1000);
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
  setMessage('Checking Steam...');
  renderControls();

  const checks = products.flatMap((product) => regions.map((region) => ({ product, region })));

  try {
    const results = await Promise.all(checks.map(async ({ product, region }) => {
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
    }));

    for (const result of results) {
      state.results.set(resultKey(result.product.id, result.region), result);
      maybeNotify(result, manual);
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
  const key = resultKey(result.product.id, result.region);
  const isAvailable = Boolean(result.status && result.status.found);
  const wasAvailable = state.availability.get(key) === true;
  state.availability.set(key, isAvailable);

  if (!isAvailable || wasAvailable || !canUseNotifications() || Notification.permission !== 'granted') {
    return;
  }

  const suffix = manual ? 'Found during manual check.' : 'Found during watch cycle.';
  void notify(
    `${result.product.name} in stock: ${result.region}`,
    `${result.status.reason} ${suffix}`,
    result.pageUrl
  ).catch((error) => setMessage(error.message));
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

function useSelectedCountry() {
  const code = normalizeRegion(els.countrySelect.value);
  if (!code) {
    setMessage('Select a country.');
    return;
  }

  state.selectedRegions = new Set([code]);
  setMessage('');
  savePreferences();
  render();
}

function useCurrentCountry() {
  state.selectedRegions = new Set([DETECTED_REGION]);
  els.countrySelect.value = DETECTED_REGION;
  setMessage('');
  savePreferences();
  render();
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
