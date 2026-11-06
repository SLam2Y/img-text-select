// Renders README art: banner.png (1280×640, also the GitHub social preview) and feat-*.png icons.
// Run from the repo root after store/make-shots.mjs: node docs/readme/make.mjs
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const dir = resolve('docs/readme');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(`file://${dir}/banner.html`);
await page.evaluate(() => document.fonts.ready);
await page.locator('#b').screenshot({ path: `${dir}/banner.png` });
await page.goto(`file://${dir}/icons.html`);
await page.evaluate(() => document.fonts.ready);
for (const id of ['local', 'langs', 'strip', 'bubble']) {
  await page.locator(`#${id}`).screenshot({ path: `${dir}/feat-${id}.png`, omitBackground: true });
}
await browser.close();
