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
      recognition: { modelBuffer: rec, charactersDictionary: [...dict.trimEnd().split(/\r?\n/), ' '] }, // model has a trailing space class
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
