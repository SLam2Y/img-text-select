# Privacy Policy — Image Text Select

Last updated: 2026-11-05

## Summary

Image Text Select recognizes text in images on your own computer. It does not collect, store or sell personal data. The only data that leaves your device is text you choose to translate.

## What the extension processes

- **Images you click «T» on.** The image is downloaded by the extension and recognized locally by a model bundled with the extension. Images are never sent to the developer or any third party. When the extension downloads an image, it sends the origin of the page you are on as the HTTP Referer, the same value your browser sends when it displays that image. No cookies are sent with this request.
- **Text you select and translate.** When you press «Перевести» (Translate), the selected text and the target language are sent to Google Translate (`translate.googleapis.com`) to get the translation. If Google Translate is unavailable, Chrome's built-in on-device translator is used instead, and nothing is sent. Google's handling of that text is governed by the Google Privacy Policy: https://policies.google.com/privacy
- **Copying.** «Копировать» (Copy) puts the selected text into your clipboard. Nothing is sent anywhere.
- **Settings.** Your target language and OCR model choice are stored with `chrome.storage.sync`, which Chrome may sync across your signed-in browsers.

## What the extension does not do

- No analytics, tracking, advertising or remote logging.
- No accounts, no developer-operated servers.
- No reading of pages beyond the images you choose to recognize and the text you select in its own text layer.
- Data is not sold, transferred or used for purposes unrelated to the extension's single purpose, and is not used to determine creditworthiness or for lending.

## Contact

Questions: open an issue in the project's GitHub repository.

---

# Политика конфиденциальности — Image Text Select

Image Text Select распознаёт текст на картинках прямо на вашем компьютере. Расширение не собирает, не хранит и не продаёт персональные данные. Устройство покидает только текст, который вы сами отправили на перевод.

- **Картинки**, на которых вы нажали «T», скачиваются расширением и распознаются локально встроенной моделью. Ни разработчику, ни третьим лицам они не передаются. При скачивании отправляется адрес сайта, на котором вы находитесь (заголовок Referer), тот же, что браузер отправляет при показе этой картинки. Куки не отправляются.
- **Выделенный текст** уходит в Google Переводчик (`translate.googleapis.com`) только при нажатии «Перевести». Если он недоступен, используется встроенный в Chrome локальный переводчик, и ничего не отправляется.
- **Настройки** (язык перевода, модель распознавания) хранятся в `chrome.storage.sync`.
- Нет аналитики, рекламы, отслеживания, аккаунтов и собственных серверов разработчика.
