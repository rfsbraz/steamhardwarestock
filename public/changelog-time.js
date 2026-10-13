// Changelog date groups. Loaded as a plain script in the browser
// (window.ChangelogTime) and imported by tests in Node. Day boundaries use
// the visitor's time zone, so this only runs on the client.
(function (root) {
  'use strict';

  function toDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // YYYY-MM-DD of the instant in the given time zone (default: the visitor's).
  function dayKey(value, timeZone) {
    const date = toDate(value);
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function previousDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  }

  function groupEntries(entries, { now = new Date(), timeZone, locale } = {}) {
    const today = dayKey(now, timeZone);
    const yesterday = previousDay(today);
    const heading = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', month: 'short', day: 'numeric' });
    const headingWithYear = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const clock = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' });
    const full = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'full', timeStyle: 'long' });

    const groups = new Map();
    for (const entry of entries) {
      const date = toDate(entry && entry.ts);
      if (!date) continue;
      const key = dayKey(date, timeZone);
      if (!groups.has(key)) {
        let label;
        if (key === today) label = 'Today';
        else if (key === yesterday) label = 'Yesterday';
        else label = (key.slice(0, 4) === today.slice(0, 4) ? heading : headingWithYear).format(date);
        groups.set(key, { key, label, entries: [] });
      }
      groups.get(key).entries.push({ entry, time: clock.format(date), title: full.format(date), datetime: date.toISOString() });
    }
    return [...groups.values()];
  }

  const api = { dayKey, groupEntries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChangelogTime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
