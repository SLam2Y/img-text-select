const DEFAULTS = { to: 'ru', lang: 'zh' };
chrome.storage.sync.get(DEFAULTS).then(s => {
  for (const [key, value] of Object.entries(s)) {
    const el = document.getElementById(key);
    el.value = value;
    el.onchange = () => chrome.storage.sync.set({ [key]: el.value });
  }
});
