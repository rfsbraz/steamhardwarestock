'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const destination = path.join(root, 'dist');

const HASHED_ASSETS = ['app.js', 'styles.css', 'history.js'];
// styles.css is also emitted unhashed so server-rendered landing pages can link it.
const ALSO_EMIT_UNHASHED = new Set(['styles.css']);

const SITE = 'https://steamhardwarestock.com';

async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
}

async function build() {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  const hashes = {};
  for (const name of HASHED_ASSETS) {
    hashes[name] = await hashFile(path.join(source, name));
  }

  for (const name of HASHED_ASSETS) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    const hashedName = `${base}.${hashes[name]}${ext}`;
    await fs.copyFile(path.join(source, name), path.join(destination, hashedName));
    if (ALSO_EMIT_UNHASHED.has(name)) {
      await fs.copyFile(path.join(source, name), path.join(destination, name));
    }
  }

  const HTML_FILES = ['index.html', 'history.html'];
  for (const htmlFile of HTML_FILES) {
    let html = await fs.readFile(path.join(source, htmlFile), 'utf8');
    for (const name of HASHED_ASSETS) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      html = html.replaceAll(`/${name}`, `/${base}.${hashes[name]}${ext}`);
    }
    await fs.writeFile(path.join(destination, htmlFile), html);
  }

  const skip = new Set([...HTML_FILES, ...HASHED_ASSETS, 'sitemap.xml']);
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

  await writeSitemap();

  const summary = HASHED_ASSETS.map((n) => `${n}=${hashes[n]}`).join(', ');
  console.log(`Built: ${summary}`);
}

async function writeSitemap() {
  const products = (await import('../lib/products.mjs')).PRODUCTS;
  const regions = (await import('../lib/products.mjs')).REGIONS;
  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: `${SITE}/`, priority: '1.0' },
    { loc: `${SITE}/history`, priority: '0.6' }
  ];
  for (const p of products) {
    urls.push({ loc: `${SITE}/${p.id}`, priority: '0.9' });
    for (const r of regions) {
      urls.push({ loc: `${SITE}/${p.id}/${r.code.toLowerCase()}`, priority: '0.7' });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
  await fs.writeFile(path.join(destination, 'sitemap.xml'), xml);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
