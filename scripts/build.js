'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');

const CF_HEADERS = `/sw.js
  Cache-Control: no-cache
/app.*.js
  Cache-Control: public, max-age=31536000, immutable
/history.*.js
  Cache-Control: public, max-age=31536000, immutable
/stock-status.*.js
  Cache-Control: public, max-age=31536000, immutable
/affiliate.*.js
  Cache-Control: public, max-age=31536000, immutable
/styles.*.css
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`;
// BUILD_DIST lets tests build into a temp dir so parallel test files do not clash.
const destination = process.env.BUILD_DIST ? path.resolve(process.env.BUILD_DIST) : path.join(root, 'dist');

const HASHED_ASSETS = ['app.js', 'styles.css', 'history.js', 'stock-status.js', 'affiliate.js'];
// styles.css is also emitted unhashed so the prerendered landing pages can link it.
const ALSO_EMIT_UNHASHED = new Set(['styles.css']);

const Affiliate = require('../public/affiliate.js');
const CONFIG_RE = /\/\*AFFILIATE_CONFIG\*\/[\s\S]*?\/\*END_AFFILIATE_CONFIG\*\//;

// affiliate.config.json holds empty placeholders. Real IDs come from env:
// AFFILIATE_JSAUX_REF, AFFILIATE_AMAZON_ENABLED, AFFILIATE_AMAZON_TAG.
async function loadAffiliateConfig() {
  const file = JSON.parse(await fs.readFile(path.join(root, 'affiliate.config.json'), 'utf8'));
  return Affiliate.resolveConfig(file, process.env);
}

// Assets are hashed after any build-time rewrite, so the name follows the bytes.
function assetContent(name, raw, affiliate) {
  if (name !== 'affiliate.js') return raw;
  const text = raw.toString('utf8');
  if (!CONFIG_RE.test(text)) throw new Error('affiliate.js is missing its CONFIG markers');
  return Buffer.from(text.replace(CONFIG_RE, `/*AFFILIATE_CONFIG*/${JSON.stringify(affiliate)}/*END_AFFILIATE_CONFIG*/`));
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

async function build() {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  const affiliate = await loadAffiliateConfig();
  const hashes = {};
  for (const name of HASHED_ASSETS) {
    const content = assetContent(name, await fs.readFile(path.join(source, name)), affiliate);
    hashes[name] = hashContent(content);
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    await fs.writeFile(path.join(destination, `${base}.${hashes[name]}${ext}`), content);
    if (ALSO_EMIT_UNHASHED.has(name)) {
      await fs.writeFile(path.join(destination, name), content);
    }
  }

  const { injectAnalytics } = await import('../lib/analytics.mjs');
  const HTML_FILES = ['index.html', 'history.html'];
  for (const htmlFile of HTML_FILES) {
    let html = injectAnalytics(await fs.readFile(path.join(source, htmlFile), 'utf8'))
      .replace('<!-- affiliate:footer -->', Affiliate.footerDisclosure(affiliate));
    for (const name of HASHED_ASSETS) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      html = html.replaceAll(`/${name}`, `/${base}.${hashes[name]}${ext}`);
    }
    await fs.writeFile(path.join(destination, htmlFile), html);
  }

  const skip = new Set([...HTML_FILES, ...HASHED_ASSETS]);
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const src = path.join(source, entry.name);
    const dest = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await fs.cp(src, dest, { recursive: true, force: true });
    } else {
      await fs.copyFile(src, dest);
    }
  }

  const { loadData, prerender } = await import('./prerender.mjs');
  const pages = await prerender(destination, { ...(await loadData()), affiliate });
  console.log(`Prerendered ${pages} landing pages`);

  // Cloudflare Pages sets CF_PAGES=1. vercel.json covers the same headers on Vercel.
  if (process.env.CF_PAGES) {
    await fs.writeFile(path.join(destination, '_headers'), CF_HEADERS);
  }

  const summary = HASHED_ASSETS.map((n) => `${n}=${hashes[n]}`).join(', ');
  console.log(`Built: ${summary}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
