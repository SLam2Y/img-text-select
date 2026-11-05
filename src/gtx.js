// Unofficial free Google Translate endpoint (no key). Can be rate-limited; content.js falls back to Chrome's Translator API.
export const gtxUrl = (text, to) =>
  'https://translate.googleapis.com/translate_a/single?' +
  new URLSearchParams({ client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text });

export const parseGtx = json => json[0].map(seg => seg[0]).filter(Boolean).join('');
