import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Runs the real public/app.js against a tiny fake DOM, then presses #startButton.
const APP = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

function fakeElement(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(), children: [], style: {}, dataset: {}, textContent: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    fire(type) { return (listeners[type] || []).map((fn) => fn({ type, target: el, preventDefault() {} })); },
    appendChild(child) { el.children.push(child); return child; },
    append(...kids) { el.children.push(...kids); },
    replaceChildren(...kids) { el.children = kids; },
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
    focus() {}, blur() {}, closest: () => null, contains: () => false, remove() {}, scrollIntoView() {}
  };
  return new Proxy(el, { get: (t, k) => (k in t ? t[k] : undefined) });
}

function boot({ search = '', gtag } = {}) {
  const byId = new Map();
  const created = [];
  const docListeners = {};
  const document = {
    title: 'Steam hardware stock',
    getElementById(id) { if (!byId.has(id)) byId.set(id, fakeElement()); return byId.get(id); },
    createElement(tag) { const el = fakeElement(tag); created.push(el); return el; },
    createDocumentFragment: () => fakeElement('fragment'),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    querySelector: () => null, querySelectorAll: () => [],
    visibilityState: 'visible', hasFocus: () => true
  };
  const store = new Map();
  const win = {
    document,
    location: { search, pathname: '/', href: `https://x/${search}`, origin: 'https://x' },
    history: { replaceState() {} },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: { language: 'en-US', languages: ['en-US'] },
    fetch: () => new Promise(() => {}),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    URL, URLSearchParams, Intl, console, Promise, Date, Math, JSON, Map, Set
  };
  if (gtag) win.gtag = gtag;
  win.window = win;
  vm.createContext(win);
  vm.runInContext(APP, win);
  for (const fn of docListeners.DOMContentLoaded || []) fn();
  const productBoxes = created.filter((el) => el.tagName === 'INPUT' && el.type === 'checkbox');
  return {
    press: () => byId.get('startButton').fire('click'),
    // Untick every product chip, like a visitor clearing the selection.
    untickAll: () => { for (const box of productBoxes) { if (box.checked) { box.checked = false; box.fire('change'); } } }
  };
}

function recorder() {
  const calls = [];
  const gtag = (...args) => { calls.push(args); };
  return { calls, gtag, subscribes: () => calls.filter((c) => c[0] === 'event' && c[1] === 'alert_subscribe').map((c) => ({ ...c[2] })) };
}

test('Start watching with one product from ?p= sends its slug, channel tab, source homepage', () => {
  for (const slug of ['steam-deck', 'steam-dock']) {
    const r = recorder();
    boot({ search: `?p=${slug}&r=PT`, gtag: r.gtag }).press();
    assert.deepEqual(r.subscribes(), [{ product: slug, channel: 'tab', source: 'homepage' }]);
  }
});

test('several products are joined in catalog order, whatever order ?p= uses', () => {
  const r = recorder();
  boot({ search: '?p=steam-machine,steam-deck,steam-controller&r=PT', gtag: r.gtag }).press();
  assert.deepEqual(r.subscribes(), [{ product: 'steam-controller,steam-deck,steam-machine', channel: 'tab', source: 'homepage' }]);
});

test('no products picked sends no alert_subscribe', () => {
  const r = recorder();
  const page = boot({ search: '?r=PT', gtag: r.gtag });
  page.untickAll();
  page.press();
  assert.deepEqual(r.subscribes(), []);
});

test('the default selection (no ?p=) sends that product', () => {
  const r = recorder();
  boot({ search: '?r=PT', gtag: r.gtag }).press();
  assert.deepEqual(r.subscribes(), [{ product: 'steam-controller', channel: 'tab', source: 'homepage' }]);
});

test('Start watching works with gtag missing or throwing, and sends once per press', () => {
  assert.doesNotThrow(() => boot({ search: '?p=steam-deck&r=PT' }).press());
  let attempts = 0;
  const page = boot({ search: '?p=steam-deck&r=PT', gtag: (_, name) => { if (name === 'alert_subscribe') attempts++; throw new Error('blocked'); } });
  assert.doesNotThrow(() => page.press());
  assert.equal(attempts, 1);
});
