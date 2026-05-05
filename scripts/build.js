'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const destination = path.join(root, 'dist');

const HASHED_ASSETS = ['app.js', 'styles.css'];

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

  // Write hashed asset files
  for (const name of HASHED_ASSETS) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    const hashedName = `${base}.${hashes[name]}${ext}`;
    await fs.copyFile(path.join(source, name), path.join(destination, hashedName));
  }

  // Rewrite index.html to reference hashed filenames
  let html = await fs.readFile(path.join(source, 'index.html'), 'utf8');
  for (const name of HASHED_ASSETS) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    html = html.replaceAll(`/${name}`, `/${base}.${hashes[name]}${ext}`);
  }
  await fs.writeFile(path.join(destination, 'index.html'), html);

  // Copy all other files unchanged
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (['index.html', ...HASHED_ASSETS].includes(entry.name)) continue;
    const src = path.join(source, entry.name);
    const dest = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await fs.cp(src, dest, { recursive: true, force: true });
    } else {
      await fs.copyFile(src, dest);
    }
  }

  const summary = HASHED_ASSETS.map((n) => `${n}=${hashes[n]}`).join(', ');
  console.log(`Built: ${summary}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
