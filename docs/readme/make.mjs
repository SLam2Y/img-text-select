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
// Settings window cropped out of the store screenshot (sheet sits at x 460–820, y 48–626).
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`file://${resolve('store/screenshot-2-settings.png')}`);
await page.screenshot({ path: `${dir}/settings.png`, clip: { x: 440, y: 28, width: 400, height: 618 } });
await browser.close();
