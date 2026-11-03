// Works out data/content-dates-seed.json from deployed version 2 manifests.
//
// Version 2 hashed the "last check on" date and the restock timeline grid,
// so every first build of a day restamped almost every page. This replays
// the deployments in order with this checkout's contentHash: a page keeps
// its date while its hash holds, and when the hash moves it takes the date
// that deployment's manifest gave it. The hash a moved page gets under the
// new contentHash can only change where the old one did too, so that date is
// the time of the change. Each page's seed entry is its hash in the last
// deployment, so it only applies while the page still renders the same.
//
// Pass the deployment URLs oldest first, starting with the first version 2
// deployment, for example:
//   node scripts/replay-content-dates.mjs https://ccab0f2b.steamhardwarestock.pages.dev ...
import fs from 'node:fs';
import path from 'node:path';
import { MANIFEST, contentHash, manifestEntry } from '../lib/content-dates.mjs';
import { SITE } from '../lib/site.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const deploys = process.argv.slice(2).map((u) => u.replace(/\/+$/, ''));
const out = path.join(root, 'data', 'content-dates-seed.json');
if (!deploys.length) throw new Error('usage: replay-content-dates.mjs deployment-url...');

async function get(url, as) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch((err) => ({ ok: false, status: err.message }));
    if (res.ok) return as === 'json' ? res.json() : res.text();
    if (attempt === 4) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
}

// { loc: hash } for every page in a deployment's manifest.
async function hashes(deploy, locs) {
  const result = {};
  const queue = [...locs];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let loc; (loc = queue.shift()); ) result[loc] = contentHash(await get(deploy + loc.slice(SITE.length), 'text'));
  }));
  return result;
}

let pages = null;
for (const deploy of deploys) {
  const manifest = await get(`${deploy}/${MANIFEST}`, 'json');
  if (manifest.version !== 2) throw new Error(`${deploy}: expected a version 2 manifest, got ${manifest.version}`);
  const now = await hashes(deploy, Object.keys(manifest.pages));
  const next = {};
  let moved = 0;
  for (const [loc, hash] of Object.entries(now)) {
    const before = pages?.[loc];
    const changed = before && before.hash === hash ? before.changed : manifestEntry(manifest, loc).changed;
    if (pages && before?.changed !== changed) moved++;
    next[loc] = changed ? { hash, changed } : { hash };
  }
  console.log(`${deploy}: ${Object.keys(next).length} pages, ${pages ? `${moved} changed` : 'start'}`);
  pages = next;
}

fs.writeFileSync(out, `${JSON.stringify({ deploys, site: SITE, pages }, null, 2)}\n`);
console.log(`wrote ${path.relative(root, out)}`);
