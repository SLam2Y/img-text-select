const DEFAULTS = { to: 'ru', lang: 'zh' };
const to = document.getElementById('to');
const saved = document.getElementById('saved');
let savedTimer;

const save = patch => chrome.storage.sync.set(patch).then(() => {
  saved.textContent = 'Сохранено';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.textContent = ''), 1500);
});

chrome.storage.sync.get(DEFAULTS).then(s => {
  to.value = s.to;
  document.querySelector(`input[name="lang"][value="${s.lang}"]`).checked = true;
});
to.onchange = () => save({ to: to.value });
for (const radio of document.querySelectorAll('input[name="lang"]')) radio.onchange = () => save({ lang: radio.value });
