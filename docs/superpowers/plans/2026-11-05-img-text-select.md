# img-text-select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome extension (MV3): hover an image, press «T», text on the image becomes natively selectable; selecting it shows a popup with «Копировать» / «Перевести» and the translation.

**Architecture:** Content script draws the «T» button and the popup (open Shadow DOM) and a transparent text layer over the image (regular DOM, so native selection / Ctrl+C / context menu work). Service worker routes OCR requests to an offscreen document and does Google gtx translation. Offscreen document fetches the image itself (host permission), decodes it with `createImageBitmap`, runs `paddleocr.js` (PP-OCRv5 mobile) on `onnxruntime-web` and returns lines with boxes. Fallback translation: Chrome Translator API from the content script.

**Tech Stack:** Plain JS (no bundler), `paddleocr@1.2.0` (MIT), `onnxruntime-web@1.30.0` (MIT), PP-OCRv5 mobile ONNX models (Apache 2.0), `node --test` for unit tests, `playwright@1.64.1` + bundled Chromium for e2e (stable Chrome ignores `--load-extension` since v137).

**Deviations from spec (apply in Task 7):** OCR cache lives in the content script (per page, `Map url → Promise`), not the service worker — SW is killed after ~30 s idle anyway. Package size ≈ 45 MB (models 35 MB + ORT WASM ~11 MB), not 20–30 MB.

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | pinned deps, `setup` / `test` / `e2e` / `pack` scripts |
| `scripts/setup.sh` | copies vendor JS/WASM from `node_modules`, downloads models |
| `manifest.json` | MV3 manifest |
| `src/lines.js` | pure: paddleocr results → overlay lines in reading order |
| `src/gtx.js` | pure: gtx URL + response parsing |
| `src/background.js` | SW: offscreen lifecycle, message routing, gtx fetch |
| `src/offscreen.html`, `src/offscreen.js` | image fetch/decode + OCR |
| `src/content.js`, `src/content.css` | button, text layer, popup, translation fallback |
| `src/options.html`, `src/options.js` | target language, OCR model choice |
| `test/unit/*.test.mjs` | unit tests for `lines.js`, `gtx.js` |
| `test/make-fixtures.mjs`, `test/fixtures/*.png`, `test/page.html`, `test/e2e.mjs` | e2e |

`vendor/`, `models/`, `node_modules/` are generated, git-ignored.

---

### Task 1: Scaffold and fetch models

**Files:**
- Create: `package.json`, `.gitignore`, `scripts/setup.sh`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "img-text-select",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "bash scripts/setup.sh",
    "test": "node --test test/unit/",
    "fixtures": "node test/make-fixtures.mjs",
    "e2e": "node test/e2e.mjs",
    "pack": "rm -f dist.zip && zip -qr dist.zip manifest.json src vendor models"
  },
  "devDependencies": {
    "onnxruntime-web": "1.30.0",
    "paddleocr": "1.2.0",
    "playwright": "1.64.1"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
vendor/
models/
dist.zip
graphify-out/
```

- [ ] **Step 3: Write `scripts/setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p vendor/ort models
cp node_modules/paddleocr/dist/index.mjs vendor/paddleocr.mjs
cp node_modules/onnxruntime-web/dist/ort.wasm.min.mjs \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs \
   node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm vendor/ort/

HF=https://huggingface.co/x3zvawq/paddleocr-js-onnx/resolve/main/ppocr_v5_mobile
MS=https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master
get() { [ -s "$2" ] || curl -fL --retry 3 -o "$2" "$1"; }
get "$HF/PP-OCRv5_mobile_det_infer.onnx" models/det.onnx
get "$HF/PP-OCRv5_mobile_rec_infer.onnx" models/rec.onnx
get "$HF/ppocrv5_dict.txt" models/dict.txt
get "$MS/onnx/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile.onnx" models/korean_rec.onnx
get "$MS/paddle/PP-OCRv5/rec/korean_PP-OCRv5_rec_mobile/ppocrv5_korean_dict.txt" models/korean_dict.txt
```

- [ ] **Step 4: Install and run setup**

Run: `cd ~/img-text-select && npm install && npm run setup && ls -la vendor vendor/ort models`
Expected: `vendor/paddleocr.mjs`, three files in `vendor/ort/`, five files in `models/` (det ≈ 4.8 MB, rec ≈ 16.5 MB, dict.txt ≈ 74 KB, korean_rec ≈ 13.5 MB, korean_dict ≈ 47 KB). If an `ort-*` filename is missing, run `ls node_modules/onnxruntime-web/dist | grep wasm` and fix the `cp` line.

- [ ] **Step 5: Check paddleocr bundle has no imports**

Run: `grep -cE '^import |from "' vendor/paddleocr.mjs`
Expected: `0` (bundle is self-contained, loadable from an extension page as-is).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore scripts/setup.sh
git commit -m "chore: scaffold, vendor and model setup script"
```

---

### Task 2: `lines.js` — OCR results → overlay lines

paddleocr.js returns `RecognitionResult[]`: `{ text, confidence, box: { x, y, width, height, points? } }` in source-image pixels.

**Files:**
- Create: `src/lines.js`
- Test: `test/unit/lines.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLines } from '../../src/lines.js';

const r = (text, x, y, width, height, confidence = 0.9) => ({ text, confidence, box: { x, y, width, height } });

test('drops empty and low-confidence results, trims text', () => {
  const lines = toLines([r('  hi ', 0, 0, 40, 10), r('   ', 0, 20, 40, 10), r('noise', 0, 40, 40, 10, 0.3)]);
  assert.deepEqual(lines.map(l => l.text), ['hi']);
});

test('horizontal text reads top-to-bottom, left-to-right within a row', () => {
  const lines = toLines([r('below', 0, 30, 50, 12), r('right', 100, 2, 50, 12), r('left', 0, 0, 50, 12)]);
  assert.deepEqual(lines.map(l => l.text), ['left', 'right', 'below']);
  assert.equal(lines[0].vertical, false);
});

test('vertical columns read right-to-left, top-to-bottom', () => {
  const lines = toLines([r('左列', 0, 0, 20, 100), r('右列', 50, 0, 20, 100), r('右下', 52, 120, 20, 60)]);
  assert.deepEqual(lines.map(l => l.text), ['右列', '右下', '左列']);
  assert.ok(lines.every(l => l.vertical));
});

test('single tall glyph is not vertical', () => {
  assert.equal(toLines([r('I', 0, 0, 5, 30)])[0].vertical, false);
});

test('keeps geometry in source pixels', () => {
  assert.deepEqual(toLines([r('a b', 3, 4, 50, 12)])[0], { text: 'a b', x: 3, y: 4, w: 50, h: 12, vertical: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module .../src/lines.js`

- [ ] **Step 3: Write `src/lines.js`**

```js
// paddleocr.js RecognitionResult[] -> overlay lines in reading order.
// ponytail: tolerance-based comparator is not strictly transitive; fine for a few dozen lines per image.
export function toLines(results, minConfidence = 0.5) {
  const lines = results
    .map(({ text, confidence, box }) => ({ text: text.trim(), confidence, box }))
    .filter(l => l.text && l.confidence >= minConfidence)
    .map(({ text, box: { x, y, width: w, height: h } }) => ({
      text, x, y, w, h,
      vertical: h > w * 1.5 && [...text].length > 1,
    }));
  const vertical = lines.filter(l => l.vertical).length > lines.length / 2;
  const sameRow = (a, b) => Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2;
  const sameCol = (a, b) => Math.abs(a.x - b.x) < Math.min(a.w, b.w) / 2;
  return lines.sort(vertical
    ? (a, b) => (sameCol(a, b) ? a.y - b.y : b.x - a.x)
    : (a, b) => (sameRow(a, b) ? a.x - b.x : a.y - b.y));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lines.js test/unit/lines.test.mjs
git commit -m "feat: order OCR results into overlay lines"
```

---

### Task 3: `gtx.js` — Google translate URL and parser

gtx response shape: `[[["Привет ","Hello ",null,null,10],["мир","world",null,null,10],[null,null,"Privet mir"]],null,"en",...]` — `json[0]` is segments, the first field is translated text, transliteration segment has `null` first.

**Files:**
- Create: `src/gtx.js`
- Test: `test/unit/gtx.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gtxUrl, parseGtx } from '../../src/gtx.js';

test('url encodes text and target language', () => {
  const u = new URL(gtxUrl('a&b 你好', 'ru'));
  assert.equal(u.origin + u.pathname, 'https://translate.googleapis.com/translate_a/single');
  assert.equal(u.searchParams.get('q'), 'a&b 你好');
  assert.equal(u.searchParams.get('tl'), 'ru');
  assert.equal(u.searchParams.get('sl'), 'auto');
  assert.equal(u.searchParams.get('client'), 'gtx');
  assert.equal(u.searchParams.get('dt'), 't');
});

test('joins segments and skips transliteration', () => {
  const json = [[['Привет ', 'Hello ', null, null, 10], ['мир', 'world', null, null, 10], [null, null, 'Privet mir']], null, 'en'];
  assert.equal(parseGtx(json), 'Привет мир');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL, `Cannot find module .../src/gtx.js`

- [ ] **Step 3: Write `src/gtx.js`**

```js
// Unofficial free Google Translate endpoint (no key). Can be rate-limited; content.js falls back to Chrome's Translator API.
export const gtxUrl = (text, to) =>
  'https://translate.googleapis.com/translate_a/single?' +
  new URLSearchParams({ client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text });

export const parseGtx = json => json[0].map(seg => seg[0]).filter(Boolean).join('');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gtx.js test/unit/gtx.test.mjs
git commit -m "feat: gtx translate url and parser"
```

---

### Task 4: Manifest, service worker, offscreen OCR, options

**Files:**
- Create: `manifest.json`, `src/background.js`, `src/offscreen.html`, `src/offscreen.js`, `src/options.html`, `src/options.js`

Message protocol (all via `chrome.runtime.sendMessage`):

| From → To | Message | Reply |
|---|---|---|
| content → SW | `{ type: 'ocr', url, lang }` (`lang`: `'zh'` \| `'ko'`) | `{ lines }` or `{ error }` |
| SW → offscreen | `{ target: 'offscreen', url, lang }` | same |
| content → SW | `{ type: 'translate', text, to }` | `{ text }` or `{ error }` |

Offscreen errors start with `load:` when the image can't be fetched/decoded; anything else is an OCR error.

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Image Text Select",
  "version": "0.1.0",
  "description": "Выделяй текст на картинках как обычный, копируй и переводи.",
  "permissions": ["offscreen", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "src/background.js", "type": "module" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["src/content.js"],
    "css": ["src/content.css"],
    "run_at": "document_idle"
  }],
  "options_page": "src/options.html",
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

- [ ] **Step 2: Write `src/background.js`**

```js
import { gtxUrl, parseGtx } from './gtx.js';

let creating;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen
    .createDocument({ url: 'src/offscreen.html', reasons: ['WORKERS'], justification: 'Run the local OCR model' })
    .finally(() => (creating = null));
  await creating;
}

const fail = reply => e => reply({ error: String(e?.message ?? e) });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'ocr') {
    ensureOffscreen()
      .then(() => chrome.runtime.sendMessage({ target: 'offscreen', url: msg.url, lang: msg.lang }))
      .then(reply, fail(reply));
    return true;
  }
  if (msg.type === 'translate') {
    fetch(gtxUrl(msg.text, msg.to))
      .then(r => { if (!r.ok) throw new Error(`gtx ${r.status}`); return r.json(); })
      .then(json => reply({ text: parseGtx(json) }), fail(reply));
    return true;
  }
});
```

- [ ] **Step 3: Write `src/offscreen.html`**

```html
<!doctype html>
<meta charset="utf-8">
<script type="module" src="offscreen.js"></script>
```

- [ ] **Step 4: Write `src/offscreen.js`**

```js
import * as ort from '../vendor/ort/ort.wasm.min.mjs';
import { PaddleOcrService } from '../vendor/paddleocr.mjs';
import { toLines } from './lines.js';

ort.env.wasm.wasmPaths = chrome.runtime.getURL('vendor/ort/');
// ponytail: single thread; threads need crossOriginIsolated. Enable COOP/COEP if OCR feels slow.
ort.env.wasm.numThreads = 1;

const MODELS = {
  zh: ['models/rec.onnx', 'models/dict.txt'],
  ko: ['models/korean_rec.onnx', 'models/korean_dict.txt'],
};
const services = {};

const asset = path => fetch(chrome.runtime.getURL(path));

function service(lang) {
  return (services[lang] ??= (async () => {
    const [recPath, dictPath] = MODELS[lang] ?? MODELS.zh;
    const [det, rec, dict] = await Promise.all([
      asset('models/det.onnx').then(r => r.arrayBuffer()),
      asset(recPath).then(r => r.arrayBuffer()),
      asset(dictPath).then(r => r.text()),
    ]);
    return PaddleOcrService.createInstance({
      ort,
      modelPreset: 'PP-OCRv5_mobile',
      detection: { modelBuffer: det },
      recognition: { modelBuffer: rec, charactersDictionary: dict.trimEnd().split(/\r?\n/) },
    });
  })());
}

async function decode(url) {
  let bitmap;
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bitmap = await createImageBitmap(await res.blob());
  } catch (e) {
    throw new Error(`load: ${e.message}`);
  }
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { width, height, data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width, height, data: new Uint8Array(data.buffer) };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.target !== 'offscreen') return;
  Promise.all([decode(msg.url), service(msg.lang)])
    .then(([image, ocr]) => ocr.recognize(image))
    .then(results => reply({ lines: toLines(results) }))
    .catch(e => { console.error(e); reply({ error: String(e?.message ?? e) }); });
  return true;
});
```

- [ ] **Step 5: Write `src/options.html`**

```html
<!doctype html>
<meta charset="utf-8">
<title>Image Text Select</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; display: grid; gap: 14px; max-width: 420px; }
  label { display: grid; gap: 4px; }
</style>
<label>Переводить на
  <select id="to">
    <option value="ru">Русский</option>
    <option value="en">English</option>
    <option value="uk">Українська</option>
    <option value="ro">Română</option>
    <option value="de">Deutsch</option>
    <option value="es">Español</option>
    <option value="fr">Français</option>
  </select>
</label>
<label>Текст на картинках
  <select id="lang">
    <option value="zh">Английский, китайский, японский</option>
    <option value="ko">Корейский (и английский)</option>
  </select>
</label>
<script src="options.js"></script>
```

- [ ] **Step 6: Write `src/options.js`**

```js
const DEFAULTS = { to: 'ru', lang: 'zh' };
chrome.storage.sync.get(DEFAULTS).then(s => {
  for (const [key, value] of Object.entries(s)) {
    const el = document.getElementById(key);
    el.value = value;
    el.onchange = () => chrome.storage.sync.set({ [key]: el.value });
  }
});
```

- [ ] **Step 7: Commit**

```bash
git add manifest.json src/background.js src/offscreen.html src/offscreen.js src/options.html src/options.js
git commit -m "feat: service worker, offscreen OCR and options page"
```

(Runtime check of this task happens in Task 6 e2e — there is no UI to trigger OCR until Task 5.)

---

### Task 5: Content script — button, text layer, popup

**Files:**
- Create: `src/content.js`, `src/content.css`

- [ ] **Step 1: Write `src/content.css`** (text layer lives in page DOM so native selection works)

```css
.its-layer { position: absolute; pointer-events: none; z-index: 2147483646; margin: 0; padding: 0; }
.its-line {
  position: absolute; pointer-events: auto; margin: 0; padding: 0;
  color: transparent !important; background: none !important;
  font-family: sans-serif; line-height: 1; white-space: pre;
  transform-origin: 0 0; cursor: text;
  user-select: text !important; -webkit-user-select: text !important;
}
.its-line::selection { background: rgba(26, 115, 232, .35); color: transparent; }
.its-v { writing-mode: vertical-rl; }
```

- [ ] **Step 2: Write `src/content.js`**

```js
(() => {
  const MIN_SIZE = 80;
  const ERRORS = { load: 'Не удалось загрузить картинку', empty: 'Текст не найден', ocr: 'Ошибка распознавания' };
  let settings = { to: 'ru', lang: 'zh' };
  chrome.storage.sync.get(settings).then(s => (settings = s));
  chrome.storage.onChanged.addListener(changes => {
    for (const key in changes) settings[key] = changes[key].newValue;
  });

  // Button + popup in shadow DOM so page styles can't break them.
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:absolute;top:0;left:0;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    .t, .pop { position: absolute; font: 13px/1.35 system-ui, sans-serif; }
    .t { min-width: 26px; height: 26px; padding: 0 7px; border: 0; border-radius: 6px; cursor: pointer;
         background: #1a73e8; color: #fff; box-shadow: 0 1px 4px #0005; white-space: nowrap; }
    .pop { max-width: 360px; padding: 8px; border-radius: 8px; background: #fff; color: #202124; box-shadow: 0 2px 12px #0004; }
    .row { display: flex; gap: 6px; }
    .row button { font: inherit; padding: 4px 10px; border: 1px solid #dadce0; border-radius: 6px; background: #f8f9fa; color: inherit; cursor: pointer; }
    .out { margin-top: 6px; white-space: pre-wrap; }
    .out:empty { display: none; }
    a { color: #1a73e8; }
    [hidden] { display: none !important; }
    @media (prefers-color-scheme: dark) {
      .pop { background: #2d2e31; color: #e8eaed; }
      .row button { background: #3c4043; border-color: #5f6368; }
      a { color: #8ab4f8; }
    }
  </style>
  <button class="t" hidden>T</button>
  <div class="pop" hidden>
    <div class="row"><button data-a="copy">Копировать</button><button data-a="tr">Перевести</button></div>
    <div class="out"></div>
  </div>`;
  document.documentElement.append(host);
  const btn = root.querySelector('.t');
  const pop = root.querySelector('.pop');
  const out = root.querySelector('.out');

  const place = (el, x, y) => { el.style.left = `${x + scrollX}px`; el.style.top = `${y + scrollY}px`; };

  // --- «T» button on hover ---
  let target = null;
  let hideTimer;
  document.addEventListener('mouseover', e => {
    const img = e.target;
    if (img.tagName !== 'IMG' || img.width < MIN_SIZE || img.height < MIN_SIZE || layers.has(img)) return;
    clearTimeout(hideTimer);
    target = img;
    btn.textContent = 'T';
    btn.title = 'Выделить текст';
    btn.hidden = false;
    const r = img.getBoundingClientRect();
    place(btn, r.right - 32, r.top + 6);
  }, true);
  document.addEventListener('mouseout', e => {
    if (e.target === target) hideTimer = setTimeout(() => (btn.hidden = true), 600);
  }, true);
  btn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  btn.addEventListener('mouseleave', () => (hideTimer = setTimeout(() => (btn.hidden = true), 600)));

  btn.addEventListener('click', async () => {
    const img = target;
    btn.textContent = '…';
    try {
      const lines = await ocr(img.currentSrc || img.src);
      if (!lines.length) throw new Error('empty');
      addLayer(img, lines);
      btn.hidden = true;
    } catch (e) {
      btn.textContent = ERRORS[e.message] ?? ERRORS.ocr;
    }
  });

  // --- OCR with per-page cache ---
  const cache = new Map();
  function ocr(url) {
    if (!cache.has(url)) {
      cache.set(url, chrome.runtime.sendMessage({ type: 'ocr', url, lang: settings.lang }).then(r => {
        if (r?.lines) return r.lines;
        cache.delete(url);
        throw new Error(r?.error?.startsWith('load:') ? 'load' : 'ocr');
      }));
    }
    return cache.get(url);
  }

  // --- Transparent text layer ---
  const layers = new Map(); // img -> { layer, lines }
  function addLayer(img, lines) {
    const layer = document.createElement('div');
    layer.className = 'its-layer';
    for (const l of lines) {
      const span = document.createElement('span');
      span.className = l.vertical ? 'its-line its-v' : 'its-line';
      span.textContent = `${l.text}\n`;
      layer.append(span);
    }
    document.body.append(layer);
    layers.set(img, { layer, lines });
    layout(img);
  }

  function layout(img) {
    const { layer, lines } = layers.get(img);
    if (!img.isConnected) { layer.remove(); layers.delete(img); return; }
    const r = img.getBoundingClientRect();
    const k = r.width / img.naturalWidth;
    Object.assign(layer.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
    lines.forEach((l, i) => {
      const s = layer.children[i];
      s.style.transform = '';
      s.style.left = `${l.x * k}px`;
      s.style.top = `${l.y * k}px`;
      s.style.fontSize = `${(l.vertical ? l.w : l.h) * k * 0.85}px`;
      // Stretch the run so selection covers the whole printed line.
      s.style.transform = l.vertical
        ? `scaleY(${(l.h * k) / s.offsetHeight})`
        : `scaleX(${(l.w * k) / s.offsetWidth})`;
    });
  }

  let raf = 0;
  const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => [...layers.keys()].forEach(layout)); };
  addEventListener('resize', relayout);
  addEventListener('scroll', relayout, true);

  // --- Popup on selection inside our layer ---
  document.addEventListener('mouseup', e => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = getSelection();
      const text = sel.toString().trim();
      if (!text || !sel.anchorNode?.parentElement?.closest('.its-layer')) { pop.hidden = true; return; }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      pop.dataset.text = text;
      out.textContent = '';
      pop.hidden = false;
      place(pop, r.left, r.bottom + 6);
    });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
  pop.addEventListener('mousedown', e => e.preventDefault()); // keep the page selection alive

  pop.addEventListener('click', async e => {
    const action = e.target.dataset?.a;
    const text = pop.dataset.text;
    if (action === 'copy') {
      await navigator.clipboard.writeText(text).catch(() => document.execCommand('copy'));
      out.textContent = 'Скопировано';
    }
    if (action === 'tr') {
      out.textContent = '…';
      const translated = await translate(text);
      if (translated) { out.textContent = translated; return; }
      const link = document.createElement('a');
      link.href = `https://translate.google.com/?sl=auto&tl=${settings.to}&op=translate&text=${encodeURIComponent(text)}`;
      link.target = '_blank';
      link.textContent = 'translate.google.com';
      out.replaceChildren('Нет перевода · ', link);
    }
  });

  async function translate(text) {
    const r = await chrome.runtime.sendMessage({ type: 'translate', text, to: settings.to }).catch(() => null);
    if (r?.text) return r.text;
    try { // Chrome built-in, on-device fallback
      const [{ detectedLanguage }] = await (await LanguageDetector.create()).detect(text);
      const translator = await Translator.create({ sourceLanguage: detectedLanguage, targetLanguage: settings.to });
      return await translator.translate(text);
    } catch {
      return null;
    }
  }
})();
```

- [ ] **Step 3: Syntax check**

Run: `node --check src/content.js && node --check src/background.js && node --check src/offscreen.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/content.js src/content.css
git commit -m "feat: hover button, selectable text layer and selection popup"
```

---

### Task 6: Fixtures and e2e

**Files:**
- Create: `test/make-fixtures.mjs`, `test/page.html`, `test/e2e.mjs`, `test/fixtures/*.png` (generated, committed)

- [ ] **Step 1: Install Playwright's Chromium**

Run: `npx playwright install chromium`
Expected: downloads Chromium into `~/.cache/ms-playwright/chromium-*`.

- [ ] **Step 2: Write `test/make-fixtures.mjs`** (renders text with system Noto CJK fonts and screenshots it)

```js
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
```

- [ ] **Step 3: Generate fixtures**

Run: `npm run fixtures && ls test/fixtures`
Expected: `en.png ja.png ko.png manga.png zh.png`. Open one with the Read tool to confirm glyphs are real (not tofu boxes).

- [ ] **Step 4: Write `test/page.html`**

```html
<!doctype html>
<meta charset="utf-8">
<title>fixtures</title>
<body style="font:16px sans-serif">
  <p>Plain text paragraph for sanity.</p>
  <img id="en" src="fixtures/en.png"><br>
  <img id="zh" src="fixtures/zh.png"><br>
  <img id="ja" src="fixtures/ja.png"><br>
  <img id="ko" src="fixtures/ko.png"><br>
  <img id="manga" src="fixtures/manga.png">
</body>
```

- [ ] **Step 5: Write `test/e2e.mjs`**

```js
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
  const line = page.locator('.its-line').first();
  try {
    await line.waitFor({ timeout: 60_000 });
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
```

- [ ] **Step 6: Run e2e**

Run: `npm run e2e`
Expected: `PASS` for en, zh, ja, ko OCR, popup and translation. `manga` may FAIL (vertical text is a known model limit) — record the actual output either way.

If everything fails with "Ошибка распознавания": open the offscreen console — run e2e with `headless: false` temporarily, go to `chrome://extensions` → Inspect views → offscreen.html, read the error. Typical causes: wrong `wasmPaths` (404 on `.wasm`), CSP missing `wasm-unsafe-eval`, preset name. If only `ko` fails with garbage text, the RapidOCR Korean dict needs a trailing space entry: change `MODELS.ko` handling to `[...dict.trimEnd().split(/\r?\n/), ' ']` and rerun.

- [ ] **Step 7: Commit**

```bash
git add test/make-fixtures.mjs test/page.html test/e2e.mjs test/fixtures
git commit -m "test: fixtures and headless e2e for OCR, popup, translation"
```

---

### Task 7: Real Chrome check, spec update, package

- [ ] **Step 1: Manual check in the user's Chrome**

User loads the unpacked extension: `chrome://extensions` → «Режим разработчика» → «Загрузить распакованное» → `~/img-text-select`. Try on a real site with an English image and a manga page. Check: «T» appears, text selects, Ctrl+C copies, right-click menu is native, popup translates.

- [ ] **Step 2: Update spec with deviations**

In `docs/superpowers/specs/2026-11-05-img-text-select-design.md`:
- section «Архитектура», item 3: replace «Кэш результатов по URL в памяти, до 50 штук.» with nothing, and in item 1 add «Кэш распознанного по URL — в content script, на время жизни страницы.»
- replace «Ожидаемый размер ~20–30 МБ.» with «Размер пакета ≈ 45 МБ (модели 35 МБ, WASM ~11 МБ).»
- add to «Ошибки»: «`blob:` картинки страницы не читаются из расширения — «Не удалось загрузить картинку».»

- [ ] **Step 3: Build package**

Run: `npm run pack && du -h dist.zip`
Expected: `dist.zip` ≈ 30–45 MB (zip compresses WASM).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-11-05-img-text-select-design.md
git commit -m "docs: sync spec with implementation"
```
