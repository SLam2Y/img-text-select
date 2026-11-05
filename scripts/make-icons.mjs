// Renders icons/*.svg to the PNG sizes Chrome wants. Run: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  const svg = await readFile(size <= 16 ? 'icons/icon-small.svg' : 'icons/icon.svg', 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `icons/icon-${size}.png`, omitBackground: true });
}
await browser.close();
