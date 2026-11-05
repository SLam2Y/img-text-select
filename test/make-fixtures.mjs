import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

export const FIXTURES = {
  en: { text: 'Hello world from the image', expect: 'Hello world' },
  zh: { text: '你好世界，这是测试', expect: '你好世界' },
  ja: { text: 'こんにちは世界', expect: 'こんにちは' },
  ko: { text: '안녕하세요 세계', expect: '안녕하세요', lang: 'ko' },
  manga: { text: '日本語の縦書き', expect: '縦書き', vertical: true },
  // Webtoon strip under a reader overlay; one line sits on the 900px slice boundary.
  webtoon: {
    lines: [[100, 'TOP OF THE STRIP'], [880, 'CROSSING THE BOUNDARY'], [3000, 'MIDDLE OF THE STRIP'], [5850, 'BOTTOM OF THE STRIP']],
    expect: ['TOP OF THE STRIP', 'CROSSING THE BOUNDARY', 'MIDDLE OF THE STRIP', 'BOTTOM OF THE STRIP'],
  },
  // en.png from a cross-origin, hotlink-protected host (page.html: {{ALT}}/protected/en.png).
  hotlink: { reuse: true, expect: 'Hello world' },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir('test/fixtures', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, f] of Object.entries(FIXTURES)) {
    if (f.reuse) continue;
    const mode = f.vertical ? 'writing-mode:vertical-rl;' : '';
    const strip = f.lines?.map(([y, t]) => `<div style="position:absolute;left:60px;top:${y}px">${t}</div>`).join('');
    await page.setContent(strip
      ? `<div id="t" style="position:relative;width:900px;height:6000px;background:#fff;color:#111;font:40px sans-serif">${strip}</div>`
      : `<div id="t" style="display:inline-block;padding:24px;background:#fff;color:#111;font:40px 'Noto Serif CJK JP',serif;${mode}">${f.text}</div>`);
    await page.locator('#t').screenshot({ path: `test/fixtures/${name}.png` });
  }
  await browser.close();
}
