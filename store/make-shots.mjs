// Renders Chrome Web Store screenshots (1280×800) and the promo tile (440×280) from original artwork in store/art/.
// Run after `npm run setup`: node store/make-shots.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;

// 1. Selected speech bubble with the translation popup
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.emulateMedia({ colorScheme: 'light' });
await page.goto(`${base}/store/art/stage.html`);
const box = await page.locator('#panel').boundingBox();
await page.mouse.move(box.x + 800, box.y + 450);
await page.locator('button.t').click();
await page.locator('.its-line').first().waitFor({ timeout: 60_000 });
await page.evaluate(() => {
  const lines = [...document.querySelectorAll('.its-line')];
  const inBubble = lines.filter(l => /EXTRA|PINEAPPLE|MAD/i.test(l.textContent));
  const range = document.createRange();
  range.setStartBefore(inBubble[0]);
  range.setEndAfter(inBubble.at(-1));
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
});
await page.getByRole('button', { name: 'Перевести' }).click();
await page.waitForFunction(() => {
  const host = [...document.documentElement.children].find(el => el.shadowRoot);
  const t = host?.shadowRoot.querySelector('.out')?.textContent;
  return t && t !== '…';
}, null, { timeout: 15_000 });
await page.mouse.move(5, 5);
await page.waitForTimeout(800); // let the hover button fade out
await page.screenshot({ path: 'store/screenshot-1-translate.png' });

// 2. Settings
const opts = await ctx.newPage();
await opts.setViewportSize({ width: 1280, height: 800 });
await opts.emulateMedia({ colorScheme: 'light' });
await opts.goto(`chrome-extension://${id}/src/options.html`);
await opts.evaluate(() => document.fonts.ready);
await opts.screenshot({ path: 'store/screenshot-2-settings.png' });

// 3. Promo tile
const promo = await ctx.newPage();
await promo.goto(`${base}/store/art/promo.html`);
await promo.evaluate(() => document.fonts.ready);
await promo.locator('#tile').screenshot({ path: 'store/promo-440x280.png' });

await ctx.close();
server.close();
