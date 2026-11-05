# Image Text Select

Chrome extension that makes text inside images selectable. Hover an image, press **T**, and select the text like any other text on the page: copy it or translate it.

![Selecting a speech bubble and translating it](store/screenshot-1-translate.png)

- OCR runs locally (PaddleOCR PP-OCRv5 on ONNX Runtime Web). Images are never uploaded.
- English, Chinese, Japanese, Korean, including vertical text and long vertical comic strips.
- Native selection: Ctrl+C and the right-click menu work. Multi-line bubbles are translated as one sentence.
- Translation via Google Translate, with Chrome's on-device Translator API as fallback.

## Install from source

```bash
npm install
npm run setup
```

`setup` copies ONNX Runtime and paddleocr.js into `vendor/` and downloads the OCR models (~35 MB) into `models/`. Then open `chrome://extensions`, enable Developer mode, click **Load unpacked** and pick this folder.

## Develop

```bash
npm test          # unit tests
npx playwright install chromium
npm run e2e       # headless end-to-end run with the extension loaded
npm run pack      # dist.zip for the Chrome Web Store
```

Store screenshots and promo tile: `node store/make-shots.mjs`. Store texts and permission justifications: [`store/listing.md`](store/listing.md).

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: images are processed on your computer; only the text you choose to translate is sent to Google Translate.

## License

MIT, see [LICENSE](LICENSE). Third-party components and their licenses: [CREDITS.md](CREDITS.md), [`licenses/`](licenses/).
