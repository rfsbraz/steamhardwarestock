'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const destination = path.join(root, 'dist');

async function copyPublic() {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    force: true
  });
  console.log(`Copied ${source} to ${destination}`);
}

copyPublic().catch((error) => {
  console.error(error);
  process.exit(1);
});
