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
