// Unofficial free Google Translate endpoint (no key). Can be rate-limited; content.js falls back to Chrome's Translator API.
export const gtxUrl = (text, to) =>
  'https://translate.googleapis.com/translate_a/single?' +
  new URLSearchParams({ client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text });

export const parseGtx = json => json[0].map(seg => seg[0]).filter(Boolean).join('');

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

// OCR gives one line per printed line, and Google treats newlines as sentence breaks,
// so a speech bubble gets translated in fragments. Join it back into running text.
export function joinLines(text) {
  let t = text
    .replace(/(\p{L})-\n(?=\p{L})/gu, '$1')
    .replace(/\s*\n\s*/g, (m, i, s) => (CJK.test(s[i - 1] ?? '') && CJK.test(s[i + m.length] ?? '') ? '' : ' '))
    .trim();
  // Comic lettering is ALL CAPS; translation is noticeably better on sentence case.
  if (!/\p{Ll}/u.test(t) && /\p{Lu}.*\p{Lu}/u.test(t)) {
    t = t.toLowerCase()
      .replace(/(^|[.!?…]\s+)(\p{L})/gu, (_, before, c) => before + c.toUpperCase())
      .replace(/\bi\b/g, 'I');
  }
  return t;
}
