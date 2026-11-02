import { createHash } from 'node:crypto';

// When each sitemap page's content last changed, for sitemap lastmod.
//
// Each deploy publishes indexnow-manifest.json, { version: 2, rev, pages:
// { loc: { hash, changed } } }, and the next build reads it back. A page whose
// hash is unchanged keeps its date. A changed or new page is dated by what
// changed it: the commit time when the code moved on since the last deploy,
// or the time of the stock check that produced the build when only data did.
// Neither is the build clock.
//
// Version 1 manifests carry only hashes. Those pages take their date from
// data/content-dates-seed.json, which scripts/seed-content-dates.mjs works out
// from git: the merge that last changed each page's rendered content. A seed
// entry records the hash it was worked out for and only applies to that exact
// content. A page with no previous manifest and no matching seed gets no date,
// never a made-up one.

// What a search engine would see as the page's content: everything except
// times, relative ages, dateModified, asset links, non-JSON-LD scripts and
// the JSAUX deal strip, whose prices change every day.
export function contentHash(html) {
  const text = String(html)
    .replace(/<aside class="deal-strip"[\s\S]*?<\/aside>/g, '')
    .replace(/<time\b[^>]*>[\s\S]*?<\/time>(\s*\((?:just now|\d+\s*(?:min|h|d)\s*ago|\d+[mhd] ago)\))?/g, '')
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '')
    // Follows the latest stock event, or the check time when there is none.
    .replace(/"dateModified":\s*"[^"]*",?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export const MANIFEST = 'indexnow-manifest.json';

const iso = (t) => (t && Number.isFinite(Date.parse(t)) ? new Date(t).toISOString() : null);

// The later of two times, either of which may be missing.
export function laterOf(a, b) {
  const x = iso(a);
  const y = iso(b);
  if (!x || !y) return x || y;
  return x > y ? x : y;
}

// v1 pages are bare hashes, v2 pages are { hash, changed }.
export function manifestEntry(manifest, loc) {
  const entry = manifest?.pages?.[loc];
  if (entry == null) return null;
  return typeof entry === 'string' ? { hash: entry } : entry;
}

// hashes: { loc: hash } for this build. previous: the live manifest or null.
// seed: { loc: { hash, changed } } for pages whose old entry has no date.
export function nextManifest({ hashes, previous, seed = {}, rev = null, revTime = null, dataTime = null }) {
  const known = previous && (previous.version === 1 || previous.version === 2) && previous.pages ? previous : null;
  const codeMoved = !known?.rev || !rev || known.rev !== rev;
  const changeTime = iso(codeMoved ? revTime || dataTime : dataTime);
  const seeded = (loc, hash) => (seed[loc]?.hash === hash ? iso(seed[loc].changed) : null);
  const pages = {};
  for (const [loc, hash] of Object.entries(hashes)) {
    const before = manifestEntry(known, loc);
    let changed;
    if (before && before.hash === hash) changed = iso(before.changed) || seeded(loc, hash);
    else if (known) changed = changeTime;
    else changed = seeded(loc, hash);
    pages[loc] = changed ? { hash, changed } : { hash };
  }
  return { version: 2, rev, pages };
}
