import * as ort from '../vendor/ort/ort.wasm.min.mjs';
import { PaddleOcrService } from '../vendor/paddleocr.mjs';
import { toLines } from './lines.js';
import { slices, inCore } from './slices.js';

ort.env.wasm.wasmPaths = chrome.runtime.getURL('vendor/ort/');
// ponytail: single thread; threads need crossOriginIsolated. Enable COOP/COEP if OCR feels slow.
ort.env.wasm.numThreads = 1;

const MODELS = {
  zh: ['models/rec.onnx', 'models/dict.txt'],
  ko: ['models/korean_rec.onnx', 'models/korean_dict.txt'],
};
// Cap the short side (not the long one: webtoon strips are 900×12000+) and total pixels.
const MAX_SHORT_SIDE = 2500;
const MAX_PIXELS = 40e6;
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
      recognition: { modelBuffer: rec, charactersDictionary: [...dict.trimEnd().split(/\r?\n/), ' '] }, // model has a trailing space class
    });
  })());
}

async function decode(url) {
  let bitmap;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bitmap = await createImageBitmap(await res.blob());
  } catch (e) {
    throw new Error(`load: ${e.message}`);
  }
  const s = Math.min(1, MAX_SHORT_SIDE / Math.min(bitmap.width, bitmap.height), Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
  const w = Math.round(bitmap.width * s), h = Math.round(bitmap.height * s);
  const ctx = new OffscreenCanvas(w, h).getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { width, height, data } = ctx.getImageData(0, 0, w, h);
  return { width, height, data: new Uint8Array(data.buffer) };
}

async function recognize(image, ocr) {
  const results = [];
  for (const s of slices(image.width, image.height)) {
    const rowBytes = image.width * 4;
    const part = { width: image.width, height: s.bottom - s.top, data: image.data.subarray(s.top * rowBytes, s.bottom * rowBytes) };
    results.push(...inCore(await ocr.recognize(part), s));
  }
  return results;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.target !== 'offscreen') return;
  Promise.all([decode(msg.url), service(msg.lang)])
    .then(([image, ocr]) => recognize(image, ocr).then(results => reply({ lines: toLines(results), width: image.width })))
    .catch(e => { console.error(e); reply({ error: String(e?.message ?? e) }); });
  return true;
});
