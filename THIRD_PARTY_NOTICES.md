# Third-party notices

- Laravel framework and application skeleton: MIT (Composer package metadata and vendor license).
- Tesseract.js 6.0.1: Apache-2.0; license copied to `public/vendor/ocr/LICENSE-tesseract.md`.
- tesseract.js-core: Apache-2.0; the complete package including LICENSE is copied to `public/vendor/ocr/core/`.
- English Tesseract traineddata through @tesseract.js-data/eng 1.0.0: Apache-2.0.
  Data originates from the Tesseract language models; only the English LSTM integer model is deployed.
- Manrope font: SIL Open Font License 1.1, local `public/fonts/OFL-Manrope.txt`.
- Playwright (development tests): Apache-2.0. All npm dependency versions are pinned in package-lock.json.

Other Composer/npm packages carry their respective package licenses. Dependencies are
installed during the image build; runtime pages do not use public font/OCR CDNs.
The application does not use external stock imagery or AI-generated image assets.
