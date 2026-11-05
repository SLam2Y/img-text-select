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
  // Hit-test by geometry, not event target: manga readers cover images with overlays
  // or set pointer-events:none on them.
  let target = null;
  let hideTimer = null;
  let mouse = null;
  let hoverRaf = 0;
  let onButton = false;
  const imageAt = (x, y) => [...document.images].find(img => {
    if (img.width < MIN_SIZE || img.height < MIN_SIZE) return false;
    const r = img.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
  const hideSoon = () => {
    if (!btn.hidden && !hideTimer) hideTimer = setTimeout(() => { btn.hidden = true; hideTimer = null; }, 600);
  };
  function onHover() {
    hoverRaf = 0;
    const img = imageAt(mouse.x, mouse.y);
    if (!img || layers.has(img)) { if (!onButton) hideSoon(); return; }
    clearTimeout(hideTimer);
    hideTimer = null;
    if (img !== target) { target = img; btn.textContent = 'T'; btn.title = 'Выделить текст'; }
    btn.hidden = false;
    const r = img.getBoundingClientRect();
    // Keep the button on screen for tall webtoon strips.
    place(btn, r.right - 32, Math.min(Math.max(r.top, 0), r.bottom - 32) + 6);
  }
  const queueHover = () => { if (mouse && !hoverRaf) hoverRaf = requestAnimationFrame(onHover); };
  document.addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; queueHover(); }, { capture: true, passive: true });
  addEventListener('scroll', queueHover, { capture: true, passive: true });
  btn.addEventListener('mouseenter', () => { onButton = true; clearTimeout(hideTimer); hideTimer = null; });
  btn.addEventListener('mouseleave', () => { onButton = false; hideSoon(); });

  btn.addEventListener('click', async () => {
    const img = target;
    btn.textContent = '…';
    try {
      const url = img.currentSrc || img.src;
      const res = await ocr(url);
      if (!res.lines.length) throw new Error('empty');
      if (!layers.has(img)) addLayer(img, url, res);
      btn.hidden = true;
    } catch (e) {
      btn.textContent = ERRORS[e.message] ?? ERRORS.ocr;
    }
  });

  // --- OCR with per-page cache ---
  const cache = new Map();
  // Fetch from the page first: same-origin, blob:, data: and CORS images work with the page's cookies/Referer.
  const toDataUrl = async url => {
    try {
      const blob = await (await fetch(url)).blob();
      return await new Promise((ok, no) => {
        const fr = new FileReader();
        fr.onload = () => ok(fr.result);
        fr.onerror = no;
        fr.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  };
  function ocr(url) {
    const key = `${settings.lang} ${url}`;
    if (!cache.has(key)) {
      cache.set(key, toDataUrl(url)
        .then(u => chrome.runtime.sendMessage({ type: 'ocr', url: u, lang: settings.lang }))
        .then(r => {
          if (r?.lines) return { lines: r.lines, width: r.width };
          throw new Error(r?.error?.startsWith('load:') ? 'load' : 'ocr');
        })
        .catch(e => { cache.delete(key); throw e.message === 'load' ? e : new Error('ocr'); }));
    }
    return cache.get(key);
  }

  // --- Transparent text layer ---
  const layers = new Map(); // img -> { layer, lines, url, width }
  const ro = new ResizeObserver(() => relayout());
  function addLayer(img, url, { lines, width }) {
    const layer = document.createElement('div');
    layer.className = 'its-layer';
    for (const l of lines) {
      const span = document.createElement('span');
      span.className = l.vertical ? 'its-line its-v' : 'its-line';
      span.textContent = `${l.text}\n`;
      layer.append(span);
    }
    for (const t of ['selectstart', 'copy', 'contextmenu', 'mousedown']) layer.addEventListener(t, e => e.stopPropagation());
    document.documentElement.append(layer);
    layers.set(img, { layer, lines, url, width });
    ro.observe(img);
    layout(img);
  }

  function layout(img) {
    const { layer, lines, url, width } = layers.get(img);
    if (!img.isConnected || (img.currentSrc || img.src) !== url) { layer.remove(); layers.delete(img); ro.unobserve(img); return; }
    const r = img.getBoundingClientRect();
    const k = r.width / width;
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
      try { await navigator.clipboard.writeText(text); } catch { document.execCommand('copy'); }
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
