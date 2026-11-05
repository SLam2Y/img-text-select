import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

export const FIXTURES = {
  en: { text: 'Hello world from the image', expect: 'Hello world' },
  zh: { text: '你好世界，这是测试', expect: '你好世界' },
  ja: { text: 'こんにちは世界', expect: 'こんにちは' },
  ko: { text: '안녕하세요 세계', expect: '안녕하세요', lang: 'ko' },
  manga: { text: '日本語の縦書き', expect: '縦書き', vertical: true },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir('test/fixtures', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, f] of Object.entries(FIXTURES)) {
    const mode = f.vertical ? 'writing-mode:vertical-rl;' : '';
    await page.setContent(`<div id="t" style="display:inline-block;padding:24px;background:#fff;color:#111;font:40px 'Noto Serif CJK JP',serif;${mode}">${f.text}</div>`);
    await page.locator('#t').screenshot({ path: `test/fixtures/${name}.png` });
  }
  await browser.close();
}
