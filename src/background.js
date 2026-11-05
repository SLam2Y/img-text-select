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
