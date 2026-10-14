// One-off: renders the PNG icons in public/icons from public/favicon.svg.
// Needs Playwright (npx -p playwright node scripts/make-icons.cjs). The PNGs are committed.
const { chromium } = require('playwright');
const fs = require('fs');
const svg = fs.readFileSync('public/favicon.svg', 'utf8');
const inner = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '');
// Full-bleed square with the artwork scaled into the maskable safe zone (inner 80%).
const bleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#202124"/><g transform="translate(32 32) scale(${scale}) translate(-34 -36.5)">${inner}</g></svg>`;
const jobs = [
  ['icon-192.png', 192, svg], ['icon-512.png', 512, svg],
  ['icon-maskable-512.png', 512, bleed(1.15)], ['icon-maskable-192.png', 192, bleed(1.15)],
  ['apple-touch-icon.png', 180, bleed(1.35)]
];
(async () => {
  const b = await chromium.launch();
  for (const [name, size, src] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: `public/icons/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
  }
  await b.close();
})();
