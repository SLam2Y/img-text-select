import { gtxUrl, parseGtx, joinLines } from './gtx.js';

let creating;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen
    .createDocument({ url: 'src/offscreen.html', reasons: ['WORKERS'], justification: 'Run the local OCR model' })
    .finally(() => (creating = null));
  await creating;
}

const fail = reply => e => reply({ error: String(e?.message ?? e) });

// Hotlink-protected CDNs answer 403 without the page's Referer. Send the page origin,
// as the browser itself does for that <img>, only for our own fetch of that URL.
let ruleId = 0;
async function withReferer(url, pageUrl, fn) {
  if (!/^https?:/.test(url) || !pageUrl) return fn();
  const id = ++ruleId;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id], // a stale rule may survive a service worker restart
    addRules: [{
      id,
      priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: `${new URL(pageUrl).origin}/` }] },
      condition: { urlFilter: `|${url}|`, initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest'] },
    }],
  });
  try {
    return await fn();
  } finally {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'ocr') {
    ensureOffscreen()
      .then(() => withReferer(msg.url, sender.tab?.url, () => chrome.runtime.sendMessage({ target: 'offscreen', url: msg.url, lang: msg.lang })))
      .then(reply, fail(reply));
    return true;
  }
  if (msg.type === 'translate') {
    fetch(gtxUrl(joinLines(msg.text), msg.to))
      .then(r => { if (!r.ok) throw new Error(`gtx ${r.status}`); return r.json(); })
      .then(json => reply({ text: parseGtx(json) }), fail(reply));
    return true;
  }
});
