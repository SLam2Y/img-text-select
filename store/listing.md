# Chrome Web Store submission texts

Copy these into the developer dashboard. Screenshots: `store/screenshot-*.png` (1280×800). Small promo tile: `store/promo-440x280.png`. Icon: `icons/icon-128.png`.

## Store listing

**Name:** Image Text Select

**Category:** Tools

**Language:** Russian (add English listing with the English texts below)

### Short description (≤132 chars)

RU: Выделяйте текст прямо на картинках как обычный: копируйте и переводите. Распознавание работает на вашем компьютере.

EN: Select text right on images, like regular text. Copy it or translate it. Recognition runs locally on your computer.

### Detailed description

RU:

Текст на картинке наконец можно выделить мышью.

Наведите мышь на картинку, нажмите «T» в её углу, и поверх изображения появится невидимый слой текста. Выделяйте его как обычный: работают Ctrl+C и меню правой кнопки, а рядом с выделением появляются «Копировать» и «Перевести».

• Распознавание прямо на компьютере: картинки никуда не отправляются.
• Английский, китайский, японский, корейский, в том числе вертикальный текст.
• Длинные вертикальные ленты комиксов распознаются целиком.
• Реплика из нескольких строк переводится одной фразой.
• Перевод на 14 языков, язык выбирается в настройках.
• Светлая и тёмная тема.

Подходит для комиксов, мемов, скриншотов, инфографики и любых картинок с текстом.

EN:

Text inside images, finally selectable.

Hover an image, press «T» in its corner, and an invisible text layer appears on top of it. Select it like normal text: Ctrl+C and the right-click menu work, and «Copy» and «Translate» show up next to your selection.

• Recognition runs on your computer: images are never uploaded.
• English, Chinese, Japanese, Korean, including vertical text.
• Long vertical comic strips are recognized end to end.
• Multi-line speech bubbles are translated as one sentence.
• Translation into 14 languages, chosen in settings.
• Light and dark themes.

Works for comics, memes, screenshots, infographics and any image with text.

## Privacy practices tab

**Single purpose:** Make text inside images on web pages selectable, so the user can copy or translate it.

**Permission justifications:**

| Permission | Justification |
|---|---|
| Host permissions `<all_urls>` | The «T» button and text layer must work on whatever page the user reads. The extension also needs host access to download the image the user clicked, because page images usually come from other domains (CDNs) and cannot be read from the page because of CORS. |
| Content scripts on all sites | Shows the «T» button over images, draws the selectable text layer and the Copy/Translate popup. It does nothing until the user hovers an image and clicks «T». |
| `offscreen` | Runs the bundled OCR model (ONNX Runtime WebAssembly) in an offscreen document, because service workers cannot decode images on a canvas. |
| `storage` | Saves two settings: target language and OCR model choice. |
| `declarativeNetRequestWithHostAccess` | Many image CDNs refuse requests without the page's Referer (hotlink protection), so the extension could not download the very image the user is looking at. For the one image the user clicked, a temporary session rule sets the Referer to the current page's origin (the same value the browser itself sends for that image), only for the extension's own request, and is removed right after. |

**Remote code:** No. All JavaScript and WebAssembly is in the package.

**Data usage:** Check «Website content» only. Disclosure: selected text is sent to Google Translate when the user clicks «Translate». Certify all three statements: not sold to third parties, not used for unrelated purposes, not used for creditworthiness or lending.

**Privacy policy URL:** link to `PRIVACY.md` in the public GitHub repository, e.g. `https://github.com/SLam2Y/img-text-select/blob/main/PRIVACY.md`.

## Notes for review

- Do not use pages of real manga or comics in screenshots or promo images; the provided ones are original artwork made for this listing.
- Avoid naming specific manga or comics sites in the listing.
