// Works out data/content-dates-seed.json: for each sitemap page, the merge to
// main that last changed its rendered content. Version 1 IndexNow manifests
// only hold hashes, so this is where those pages get a first, true date.
//
// It builds every first-parent commit on main from --base back to --floor
// with the same fixture, hashes each page with this checkout's contentHash,
// and walks back while the hash still matches this checkout's build. The date
// is the committer time of the oldest merge in that run. Pages that match all
// the way back get the floor's date, the merge that started prerendering.
// A commit that fails to build ends the walk for every page still open, so a
// date is never older than what a build shows.
//
// Run it with the production affiliate variables so the hashes match the
// deployed pages, for example:
//   AFFILIATE_JSAUX_REF=... node scripts/seed-content-dates.mjs --fixture status-fixture.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MANIFEST, contentHash } from '../lib/content-dates.mjs';
import { SITE } from '../lib/site.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const fixture = path.resolve(args.fixture || '');
const base = args.base || 'origin/main';
const floor = args.floor || '63fb5c2';
const out = path.resolve(args.out || path.join(root, 'data', 'content-dates-seed.json'));
if (!args.fixture) throw new Error('usage: seed-content-dates.mjs --fixture file [--base ref] [--floor ref] [--out file]');

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shs-seed-'));

function build(dir, dist) {
  execFileSync(process.execPath, ['scripts/build.js'], {
    cwd: dir,
    stdio: 'pipe',
    env: { ...process.env, BUILD_DIST: dist, PRERENDER_FIXTURE: fixture, PRERENDER_OFFLINE: '', PRERENDER_SOURCE_URL: '', CF_PAGES: '1', PRERENDER_PREVIOUS_MANIFEST: '' },
  });
}

// Older builds wrote x/index.html, newer ones write x.html.
function pageHash(dist, loc) {
  const rel = new URL(loc).pathname.replace(/^\/|\/$/g, '');
  const files = rel ? [`${rel}.html`, `${rel}/index.html`] : ['index.html'];
  for (const file of files) {
    const full = path.join(dist, file);
    if (fs.existsSync(full)) return contentHash(fs.readFileSync(full, 'utf8'));
  }
  return null;
}

const here = path.join(tmp, 'head');
build(root, here);
const target = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(here, MANIFEST), 'utf8')).pages).map(([loc, e]) => [loc, e.hash]));

const commits = git('rev-list', '--first-parent', `${floor}^..${base}`).split('\n');
if (commits.at(-1) !== git('rev-parse', floor)) throw new Error(`${floor} is not on the first-parent line of ${base}`);

const pages = {};
let open = new Set(Object.keys(target));
for (const sha of commits) {
  if (!open.size) break;
  const time = new Date(git('log', '-1', '--format=%cI', sha)).toISOString();
  const dir = path.join(tmp, sha);
  fs.mkdirSync(dir);
  execFileSync('sh', ['-c', `git archive ${sha} | tar -x -C "${dir}"`], { cwd: root });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  try {
    build(dir, path.join(dir, 'dist'));
  } catch {
    console.error(`${sha.slice(0, 7)} does not build, stopping ${open.size} pages here`);
    break;
  }
  const still = new Set();
  for (const loc of open) {
    if (pageHash(path.join(dir, 'dist'), loc) !== target[loc]) continue;
    pages[loc] = { hash: target[loc], changed: time };
    still.add(loc);
  }
  console.error(`${sha.slice(0, 7)} ${time} ${still.size} pages unchanged`);
  open = still;
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });

const sorted = Object.fromEntries(Object.keys(pages).sort().map((loc) => [loc, pages[loc]]));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ base: git('rev-parse', base), floor: git('rev-parse', floor), site: SITE, pages: sorted }, null, 2)}\n`);
console.error(`wrote ${Object.keys(sorted).length} of ${Object.keys(target).length} pages to ${path.relative(root, out)}`);
