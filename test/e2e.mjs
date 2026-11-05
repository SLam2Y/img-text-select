// Loads the unpacked extension into Playwright's Chromium (headless), serves test/ over http, checks OCR + popup + translation.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { FIXTURES } from './make-fixtures.mjs';

const ext = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(resolve('test'), decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    res.writeHead(200, { 'content-type': types[extname(req.url)] ?? 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

for (const [id, f] of Object.entries(FIXTURES)) {
  await sw.evaluate(lang => chrome.storage.sync.set({ lang }), f.lang ?? 'zh');
  const page = await ctx.newPage();
  await page.goto(`${base}/page.html`);
  const img = page.locator(`#${id}`);
  await img.scrollIntoViewIfNeeded();
  await img.hover();
  await page.locator('button.t').click();
  const t0 = Date.now();
  const line = page.locator('.its-line').first();
  try {
    await line.waitFor({ timeout: 60_000 });
    console.log(`${id}: OCR ${Date.now() - t0} ms`);
    const text = (await page.locator('.its-layer').innerText()).replace(/\s+/g, '');
    check(text.includes(f.expect.replace(/\s+/g, '')), `${id}: OCR "${text}" contains "${f.expect}"`);
  } catch {
    check(false, `${id}: no text layer, button says "${await page.locator('button.t').innerText()}"`);
    await page.close();
    continue;
  }
  if (id === 'en') {
    // Select the first recognized line programmatically, then fire mouseup like a real drag would.
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.its-line'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
    });
    await page.locator('.pop').waitFor({ state: 'visible', timeout: 5000 });
    check(true, 'en: popup shown on selection');
    await page.getByRole('button', { name: 'Перевести' }).click();
    await page.waitForFunction(() => {
      const host = [...document.documentElement.children].find(el => el.shadowRoot);
      const t = host?.shadowRoot.querySelector('.out')?.textContent;
      return t && t !== '…';
    }, null, { timeout: 15_000 }).catch(() => {});
    const translated = await page.locator('.out').innerText();
    check(/[а-яё]/i.test(translated), `en: translation "${translated}"`);
  }
  await page.close();
}

await ctx.close();
server.close();
process.exit(failed ? 1 : 0);
