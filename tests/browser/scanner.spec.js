import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { factory, hourglass } from '../fixtures/date-symbols.js';

const environment = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')]; }));
const email = process.env.TEST_EMAIL || environment.INITIAL_ADMIN_EMAIL;
const password = process.env.TEST_PASSWORD || environment.INITIAL_ADMIN_PASSWORD;
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8092';
let authCookies;

async function login(page) {
    if (authCookies) {
        await page.context().addCookies(authCookies);
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Setiap barang, tercatat.' })).toBeVisible();
        return;
    }
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Masuk ke workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Setiap barang, tercatat.' })).toBeVisible();
    authCookies = await page.context().cookies();
}

async function newSession(page, reference) {
    await page.goto('/receiving-sessions/new');
    await page.getByLabel('Nomor referensi').fill(reference);
    await page.getByLabel('Supplier', { exact: false }).fill('Browser Test Supplier');
    await page.getByRole('button', { name: 'Buat sesi & buka scanner' }).click();
    await expect(page.locator('#scanner')).toBeVisible();
}

async function labelImage(page, lines = ['LOT: ABC12345', 'MFG: 2025-12-25', 'EXP: 2027-12-30']) {
    const encoded = await page.evaluate(lines => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 600;
        const context = canvas.getContext('2d');
        context.fillStyle = 'white';
        context.fillRect(0, 0, 1200, 600);
        context.fillStyle = 'black';
        context.font = 'bold 54px monospace';
        lines.forEach((line, index) => context.fillText(line, 60, 150 * (index + 1)));
        return canvas.toDataURL('image/png').split(',')[1];
    }, lines);
    await page.locator('#image-file').setInputFiles({ name: 'label-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
    await expect(page.locator('#image-workspace')).toBeVisible();
}

async function selectCrop(page, top = 0.10, bottom = 0.32) {
    await openDetails(page, '#scan-tools');
    await page.getByRole('button', { name: 'Pilih area', exact: true }).click();
    const bounds = await page.locator('#crop-overlay').boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.025, bounds.y + bounds.height * top);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.88, bounds.y + bounds.height * bottom, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#read-selected')).toBeEnabled();
}

async function openDetails(page, selector) {
    const section = page.locator(selector);
    if (await section.count() && !(await section.evaluate(element => element.open))) await section.locator(':scope > summary').click();
}

async function chooseCameraField(page, name) {
    await openDetails(page, '#scan-tools');
    await page.getByRole('radio', { name, exact: true }).check();
}

for (const mobile of [false, true]) test(`simple scanner shows only essential fields and scans without opening tools on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return { text: "LOT: SIMPLE123\\nMFG: 2026-08-11\\nEXP: 2027-08-11", confidence: 95 }; } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-SIMPLE-${mobile}-${Date.now()}`);
    expect(await page.locator('#item-form input:visible, #item-form textarea:visible, #item-form select:visible').evaluateAll(inputs => inputs.map(input => input.name))).toEqual(['lot_number', 'mfg_date', 'exp_date', 'confirmed']);
    await expect(page.locator('#auto-ocr')).toBeHidden();
    await expect(page.locator('#preprocess-preset')).toBeHidden();
    await expect(page.locator('#manual-crop')).toBeHidden();
    await expect(page.locator('#candidate-options')).toBeHidden();
    await expect(page.locator('#save-item')).toBeDisabled();
    await page.locator('#start-camera').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#image-file')).toBeFocused();
    await page.locator('#start-camera').click();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await expect(page.locator('#start-camera')).toBeHidden();
    await expect(page.locator('#camera-field-picker')).toBeHidden();
    await expect(page.locator('#auto-ocr')).toContainText('Scan label');
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('SIMPLE123');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
    await expect(page.locator('[name="ocr_raw_text"]')).toBeHidden();
    await expect(page.locator('#scan-tools')).not.toHaveAttribute('open', '');
    await expect(page.locator('#candidate-options')).not.toHaveAttribute('open', '');
    await expect(page.locator('#save-item')).toBeDisabled();
    if (mobile) {
        await expect(page.locator('#scan-result-heading')).toBeFocused();
        await expect(page.locator('[name="lot_number"]')).toBeInViewport();
    }
    await page.locator('#confirm-scan').check();
    const saved = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    expect((await saved).status()).toBe(201);
    await expect(page.locator('#item-success')).toBeVisible();
    await page.locator('#next-item').click();
    await expect(page.locator('#start-camera')).toBeVisible();
    await expect(page.locator('#auto-ocr')).toBeHidden();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('');
    await expect(page.locator('#item-details')).not.toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

test('optional fields remain editable and invalid values reveal their collapsed section', async ({ page }) => {
    await login(page);
    await newSession(page, `E2E-OPTIONAL-${Date.now()}`);
    await page.locator('[name="lot_number"]').fill('OPTIONAL123');
    await openDetails(page, '#item-details');
    await page.locator('[name="product_name"]').fill('Produk dengan catatan');
    await page.locator('[name="notes"]').fill('Tetap tersimpan dari bagian opsional');
    await page.locator('[name="ocr_confidence"]').fill('101');
    await page.locator('#item-details > summary').click();
    await page.locator('#confirm-scan').check();
    await page.locator('#save-item').click();
    await expect(page.locator('#item-details')).toHaveAttribute('open', '');
    await expect(page.locator('[name="ocr_confidence"]')).toBeFocused();
    await expect(page.locator('#item-success')).toBeHidden();
    await page.locator('[name="ocr_confidence"]').fill('95');
    await page.locator('#confirm-scan').check();
    const saved = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await saved;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({ product_name: 'Produk dengan catatan', notes: 'Tetap tersimpan dari bagian opsional', ocr_confidence: 95 });
});

async function legacyDateForm(page) {
    await page.route(/\/receiving-sessions\/\d+\/scanner$/, async route => {
        const response = await route.fetch();
        const html = (await response.text())
            .replace(/<label>Ketelitian (?:MFG|EXP)<select[\s\S]*?<\/label>/g, '')
            .replace(/<label data-date-month="(?:mfg|exp)"[\s\S]*?<\/label>/g, '')
            .replace(/ data-date-day="(?:mfg|exp)"/g, '');
        await route.fulfill({ response, body: html });
    });
}

test('new JavaScript works with a production form that has no month precision controls', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await legacyDateForm(page);
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return { text: "LOT: LEGACY123\\nMG: 11 aug 2026\\nED: 11 aug 2027", confidence: 95 }; } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-LEGACY-FORM-${Date.now()}`);
    await expect(page.locator('[name="mfg_month"], [name="exp_month"], [data-date-precision]')).toHaveCount(0);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-video')).toBeVisible();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('LEGACY123');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
    await page.locator('#confirm-scan').check();
    await page.locator('#save-item').click();
    await expect(page.locator('#item-success')).toBeVisible();
    await page.locator('#next-item').click();
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
    await expect(page.locator('#start-camera')).toBeEnabled();
    expect(errors).toEqual([]);
});

test('legacy production HTML preserves a partial date as raw text without inventing a day', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await legacyDateForm(page);
    await login(page);
    await newSession(page, `E2E-LEGACY-MONTH-${Date.now()}`);
    await openDetails(page, '#item-details');
    await page.locator('[name="ocr_raw_text"]').fill('EXP: 2031.08');
    await page.locator('#parse-text').click();
    await expect(page.locator('[name="exp_raw"]')).toHaveValue('2031.08');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
    await expect(page.locator('[data-date-feedback="exp"]')).toContainText('HTML halaman belum mendukung input bulan/tahun');
    await page.locator('#confirm-scan').check();
    const pending = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.data.exp_date).toBeNull();
    expect(result.data.exp_month).toBeNull();
    expect(result.data.exp_raw).toBe('2031.08');
    expect(result.data.verification_status).toBe('needs_review');
    await expect(page.locator('#item-success')).toBeVisible();
    await page.locator('[data-clear-field="exp"]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-fields').click();
    await expect(page.locator('[name="exp_raw"]')).toHaveValue('');
    expect(errors).toEqual([]);
});

test('login, local OCR, multiple crop areas, confirm, save, edit and CSV', async ({ page }) => {
    const errors = [];
    const externalRequests = [];
    const workers = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(process.env.TEST_BASE_URL || 'http://localhost:8092').origin) externalRequests.push(request.url()); });
    page.on('worker', worker => workers.push(worker));
    await login(page);
    await newSession(page, `E2E-OCR-${Date.now()}`);
    const scannerUrl = page.url();
    await labelImage(page);
    await expect(page.locator('#save-item')).toBeDisabled();
    expect(await page.evaluate(() => typeof window.Tesseract)).toBe('undefined');
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('ABC12345', { timeout: 90000 });
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2025-12-25');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-12-30');
    await expect(page.locator('#ocr-status')).toContainText('Selesai');
    await selectCrop(page);
    await page.locator('#crop-area').click();
    await expect(page.locator('#crop-preview canvas')).toBeVisible();
    await page.locator('#crop-field').selectOption('LOT');
    await page.locator('#read-selected').click();
    await expect(page.locator('.crop-card')).toHaveCount(1, { timeout: 60000 });
    await expect(page.locator('.crop-card').first()).toContainText('LOT: ABC12345');
    await expect(page.locator('#ocr-status')).toHaveText(/Selesai|Perlu diperiksa/);
    await selectCrop(page, 0.62, 0.82);
    await page.locator('#crop-field').selectOption('EXP');
    await page.locator('#read-selected').click();
    await expect(page.locator('.crop-card')).toHaveCount(2, { timeout: 60000 });
    await expect(page.locator('.crop-card').last()).toContainText('EXP: 2027-12-30');
    await expect(page.locator('#ocr-status')).toHaveText(/Selesai|Perlu diperiksa/);
    await openDetails(page, '#item-details');
    await page.locator('[name="product_name"]').fill('Produk OCR browser');
    await page.locator('[name="verification_status"]').selectOption('verified');
    await page.locator('#confirm-scan').check();
    await expect(page.locator('#save-item')).toBeEnabled();
    await page.locator('[name="notes"]').fill('Verifikasi ulang setelah mengubah field');
    await expect(page.locator('#confirm-scan')).not.toBeChecked();
    await page.locator('#confirm-scan').check();
    const saved = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.data.scans).toHaveLength(2);
    expect(result.data.scans[0].crop_metadata.image_width).toBe(1200);
    expect(workers).toHaveLength(1);
    expect(externalRequests).toEqual([]);
    await expect(page.locator('#item-success')).toBeVisible();
    await page.locator('#next-item').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('');
    await expect(page.locator('.crop-card')).toHaveCount(0);
    await page.locator('[name="lot_number"]').fill('SECOND-ITEM');
    await page.locator('#confirm-scan').check();
    await page.locator('#save-item').click();
    await expect(page.locator('#item-success')).toBeVisible();
    await page.goto(`/receiving-items/${result.data.id}`);
    await expect(page.getByRole('heading', { name: 'Produk OCR browser' })).toBeVisible();
    await page.locator('[name="lot_number"]').fill('EDITED-LOT');
    await page.locator('#confirm-scan').check();
    await page.locator('#save-item').click();
    await expect(page.locator('#item-success')).toBeVisible();
    const sessionUrl = scannerUrl.replace('/scanner', '');
    await page.goto(sessionUrl);
    await expect(page.getByText('LOT: EDITED-LOT', { exact: false })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Ekspor CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await page.screenshot({ path: 'test-results/desktop-session.png', fullPage: true });
    expect(errors).toEqual([]);
});

test('OCR library download failure can be retried without reloading the scanner', async ({ page }) => {
    let attempts = 0;
    await page.route('**/vendor/ocr/tesseract.min.js', async route => {
        attempts += 1;
        if (attempts === 1) await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Missing OCR asset' });
        else await route.continue();
    });
    await login(page);
    await newSession(page, `E2E-OCR-RETRY-${Date.now()}`);
    await labelImage(page);
    await page.locator('#auto-ocr').click();
    await expect(page.locator('#scanner-error')).toContainText('Gagal memuat /vendor/ocr/tesseract.min.js');
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('ABC12345', { timeout: 90000 });
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2025-12-25');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-12-30');
    await expect(page.locator('#scanner-error')).toBeHidden();
    expect(attempts).toBe(2);
});

test('fake camera capture, stop and retake release all media tracks', async ({ page }) => {
    await login(page);
    await newSession(page, `E2E-CAMERA-${Date.now()}`);
    await page.locator('#start-camera').click();
    await openDetails(page, '#scan-tools');
    await expect(page.locator('#camera-field-picker')).toBeVisible();
    await expect(page.locator('#capture-image')).toBeEnabled();
    await chooseCameraField(page, 'LOT');
    await expect(page.locator('#capture-image')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => document.querySelector('video').videoWidth)).toBeGreaterThan(0);
    await page.evaluate(() => { window.testStream = document.querySelector('video').srcObject; });
    await page.locator('#capture-image').click();
    await expect(page.locator('#image-workspace')).toBeVisible();
    await expect(page.locator('#camera-field-picker')).toBeHidden();
    expect(await page.evaluate(() => document.querySelector('video').srcObject)).toBeNull();
    expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    await page.locator('#retake').click();
    await expect(page.locator('#capture-image')).toBeEnabled();
    await page.locator('#stop-camera').click();
    await expect(page.locator('#image-workspace')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('video').srcObject)).toBeNull();
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied in test', 'NotAllowedError'); }; });
    await page.locator('#retake').click();
    await expect(page.locator('#scanner-error')).toContainText('Izin kamera ditolak');
    await expect(page.locator('#image-file')).toBeEnabled();
});

test('camera preview is visible when playback starts', async ({ page }) => {
    await page.addInitScript(() => {
        const originalPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
            if (this.id === 'camera-video' && this.hidden) return Promise.reject(new DOMException('Preview masih disembunyikan.', 'NotAllowedError'));
            return originalPlay.call(this);
        };
    });
    await login(page);
    await newSession(page, `E2E-CAMERA-VISIBLE-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-video')).toBeVisible();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await expect(page.locator('#scanner-error')).toBeHidden();
});

for (const enumeration of ['rejected', 'pending']) test(`camera works when device enumeration is ${enumeration}`, async ({ page }) => {
    await page.addInitScript(enumeration => {
        navigator.mediaDevices.enumerateDevices = () => enumeration === 'rejected' ? Promise.reject(new DOMException('Daftar perangkat tidak diizinkan.', 'NotAllowedError')) : new Promise(() => {});
    }, enumeration);
    await login(page);
    await newSession(page, `E2E-CAMERA-ENUM-${enumeration}-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-video')).toBeVisible();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await expect(page.locator('#scanner-error')).toBeHidden();
    await expect(page.locator('#switch-camera')).toBeDisabled();
    await page.locator('#stop-camera').click();
    await expect(page.locator('#camera-placeholder')).toBeVisible();
});

test('missing OCR dependencies do not disable camera startup', async ({ page }) => {
    await page.route('**/js/scanner/symbol-label-detector.js', route => route.abort('failed'));
    await login(page);
    await newSession(page, `E2E-CAMERA-NO-OCR-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-video')).toBeVisible();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await page.locator('#auto-ocr').click();
    await expect(page.locator('#scanner-error')).toContainText('Modul OCR gagal dimuat');
    await expect(page.locator('#retake')).toBeEnabled();
    await page.locator('#retake').click();
    await expect(page.locator('#camera-video')).toBeVisible();
});

test('pending camera permission can be cancelled without a late stream reopening the preview', async ({ page }) => {
    await page.addInitScript(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = constraints => new Promise(resolve => {
            window.grantCamera = async () => {
                window.lateStream = await original(constraints);
                resolve(window.lateStream);
            };
        });
    });
    await login(page);
    await newSession(page, `E2E-CAMERA-CANCEL-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-status')).toContainText('Izinkan kamera');
    await expect(page.locator('#stop-camera')).toBeEnabled();
    await page.locator('#stop-camera').click();
    await page.evaluate(() => window.grantCamera());
    await expect.poll(() => page.evaluate(() => window.lateStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    await expect(page.locator('#camera-video')).toBeHidden();
    await expect(page.locator('#start-camera')).toBeEnabled();
});

test('camera permission failure is visible next to controls and can be retried', async ({ page }) => {
    await page.addInitScript(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        let firstAttempt = true;
        navigator.mediaDevices.getUserMedia = constraints => {
            if (firstAttempt) { firstAttempt = false; return Promise.reject(new DOMException('Ditolak', 'NotAllowedError')); }
            return original(constraints);
        };
    });
    await login(page);
    await newSession(page, `E2E-CAMERA-DENIED-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-status')).toContainText('Izin kamera ditolak');
    await expect(page.locator('#camera-placeholder')).toBeVisible();
    await expect(page.locator('#start-camera')).toBeEnabled();
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-video')).toBeVisible();
    await expect(page.locator('#camera-status')).toContainText('Arahkan ke label');
});

test('camera field selection routes OCR to LOT, MFG and EXP without clearing previous scans', async ({ page }) => {
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return window.scannerTestResults.shift(); } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-CAMERA-FIELDS-${Date.now()}`);
    await page.evaluate(() => {
        window.scannerTestResults = [
            { text: 'LOT: CAMERA123\nMFG: 2025-12-25\nEXP: 2027-12-30', confidence: 95 },
            { text: '2025-12-25', confidence: 95 },
            { text: '', confidence: 0 },
            { text: '2027-12-30', confidence: 95 },
        ];
    });
    const fields = [
        { choice: 'LOT', field: 'lot_number', value: 'CAMERA123' },
        { choice: 'MG / MFG', field: 'mfg_raw', value: '2025-12-25' },
        { choice: 'MG / MFG', field: 'mfg_raw', value: '2025-12-25' },
        { choice: 'Expired Date', field: 'exp_raw', value: '2027-12-30' },
    ];
    for (const [index, field] of fields.entries()) {
        await page.locator(index === 0 ? '#start-camera' : '#retake').click();
        await openDetails(page, '#scan-tools');
        await expect(page.locator('#camera-field-picker')).toBeVisible();
        await chooseCameraField(page, field.choice);
        await expect(page.locator('#camera-field-hint')).toContainText(field.choice);
        await page.locator('#capture-image').click();
        await expect(page.locator('#auto-ocr')).toContainText(`Baca ${field.choice}`);
        await expect(page.locator('#crop-field')).toHaveValue(index === 0 ? 'LOT' : index === 3 ? 'EXP' : 'MFG');
        await page.locator('#auto-ocr').click();
        await expect(page.locator('.crop-card')).toHaveCount(index + 1);
        await expect(page.locator(`[name="${field.field}"]`)).toHaveValue(field.value);
        await expect(page.locator('[name="lot_number"]')).toHaveValue('CAMERA123');
        if (index === 0) await expect(page.locator('[name="mfg_raw"]')).toHaveValue('');
        if (index < 3) await expect(page.locator('[name="exp_raw"]')).toHaveValue('');
    }
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2025-12-25');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-12-30');
    await page.locator('#confirm-scan').check();
    const saved = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const payload = response.request().postDataJSON();
    expect(payload.scans.map(scan => scan.field_type)).toEqual(['LOT', 'MFG', 'MFG', 'EXP']);
    expect(payload.scans.every(scan => scan.crop_metadata.width > 0 && scan.crop_metadata.height > 0)).toBe(true);
    await page.locator('#next-item').click();
    await expect(page.locator('.crop-card')).toHaveCount(0);
    await page.locator('#start-camera').click();
    await expect(page.locator('#capture-image')).toBeDisabled();
    await expect(page.locator('#camera-field-picker input:checked')).toHaveCount(1);
    await chooseCameraField(page, 'Expired Date');
    await page.locator('#capture-image').click();
    await labelImage(page);
    await expect(page.locator('#auto-ocr')).toContainText('Scan label');
    await expect(page.locator('#crop-field')).toHaveValue('AUTO');
});

test('live camera OCR is clickable before a photo and captures the current preview on retake', async ({ page }) => {
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize(canvas) { window.ocrCalls = (window.ocrCalls || 0) + 1; window.ocrImageWidth = canvas.width; return { text: "LOT: LIVE" + window.ocrCalls + "\\nMFG: 11 aug 2026\\nEXP: 11 aug 2027", confidence: 95 }; } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-LIVE-OCR-${Date.now()}`);
    await expect(page.locator('#auto-ocr')).toBeDisabled();
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-video')).toBeVisible();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await expect(page.locator('#image-workspace')).toBeHidden();
    await page.evaluate(() => { window.testStream = document.querySelector('video').srcObject; });
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('LIVE1');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
    await expect(page.locator('#image-workspace')).toBeVisible();
    expect(await page.evaluate(() => window.testStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    expect(await page.evaluate(() => document.querySelector('video').srcObject)).toBeNull();
    await labelImage(page);
    await page.locator('#retake').click();
    await openDetails(page, '#scan-tools');
    await page.locator('#camera-field-picker label').filter({ hasText: /^LOT$/ }).click();
    await expect(page.locator('#auto-ocr')).toContainText('Baca LOT');
    const videoWidth = await page.locator('#camera-video').evaluate(video => video.videoWidth);
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('LIVE2');
    expect(await page.evaluate(() => window.ocrCalls)).toBe(2);
    expect(await page.evaluate(() => window.ocrImageWidth)).toBe(Math.min(videoWidth, 2560));
});

test('mobile camera labels accept real taps and OCR reads the preview without taking a separate photo', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return { text: "LOT: TAP123\\nMG: 11 agustus 2026\\nED: 11 aug 2027", confidence: 95 }; } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-TAP-AUTO-${Date.now()}`);
    await page.locator('#start-camera').tap();
    await openDetails(page, '#scan-tools');
    await page.locator('#camera-field-picker label').filter({ hasText: /^Otomatis$/ }).tap();
    await expect(page.getByRole('radio', { name: 'Otomatis', exact: true })).toBeChecked();
    await page.locator('#camera-field-picker label').filter({ hasText: /^LOT$/ }).tap();
    await expect(page.getByRole('radio', { name: 'LOT', exact: true })).toBeChecked();
    await page.locator('#camera-field-picker label').filter({ hasText: /^Otomatis$/ }).tap();
    await expect(page.getByRole('radio', { name: 'Otomatis', exact: true })).toBeChecked();
    await expect(page.locator('#auto-ocr')).toBeEnabled();
    await page.locator('#auto-ocr').tap();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('TAP123');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.close();
});

test('automatic camera mode fills LOT and calendar inputs while keeping raw dates collapsed', async ({ page }) => {
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return { text: "ED: 11 aug 2027\\nLOT: AUTO123\\nMG: 11 agustus 2026", confidence: 95 }; } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-AUTO-FIELDS-${Date.now()}`);
    await page.locator('#start-camera').click();
    await chooseCameraField(page, 'Otomatis');
    await expect(page.locator('#camera-field-hint')).toContainText('LOT, produksi, dan kedaluwarsa');
    await page.locator('#capture-image').click();
    await expect(page.locator('#crop-field')).toHaveValue('AUTO');
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('AUTO123');
    for (const [field, value] of [['mfg', '2026-08-11'], ['exp', '2027-08-11']]) {
        await expect(page.locator(`[name="${field}_date"]`)).toHaveValue(value);
        await expect(page.locator(`[name="${field}_date"]`)).toHaveAttribute('type', 'date');
        await expect(page.locator(`[name="${field}_date"]`)).toBeVisible();
        await expect(page.locator(`[name="${field}_raw"]`)).not.toBeVisible();
    }
    await expect(page.locator('#ocr-status')).toContainText('Selesai');
    await page.locator('#confirm-scan').check();
    const saved = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const payload = response.request().postDataJSON();
    expect(payload.lot_number).toBe('AUTO123');
    expect(payload.mfg_date).toBe('2026-08-11');
    expect(payload.exp_date).toBe('2027-08-11');
    expect(payload.mfg_raw).toBe('11 agustus 2026');
    expect(payload.exp_raw).toBe('11 aug 2027');
});

test('automatic detection does not guess unlabeled dates, overwrite manual dates or choose conflicting candidates', async ({ page }) => {
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return window.scannerTestResults.shift(); } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-AUTO-SAFETY-${Date.now()}`);
    await page.evaluate(() => {
        window.scannerTestResults = [
            { text: '11 agustus 2026', confidence: 95 },
            { text: 'LOT: AUTO124\nMG: 11 agustus 2026\nED: 11 aug 2027', confidence: 95 },
            { text: 'MFG: 11 aug 2026\nMFG: 12 aug 2026\nEXP: 11 aug 2027', confidence: 95 },
        ];
    });
    await page.locator('#start-camera').click();
    await chooseCameraField(page, 'Otomatis');
    await page.locator('#capture-image').click();
    await page.locator('#auto-ocr').click();
    await expect(page.locator('#parser-warnings')).toContainText('Jenis data belum dikenali');
    await expect(page.locator('#ocr-status')).toHaveText('Perlu diperiksa');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
    await expect(page.locator('[name="lot_number"]')).toHaveValue('');
    await page.locator('[name="mfg_date"]').fill('2020-01-01');
    await page.locator('#confirm-scan').check();
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('AUTO124');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2020-01-01');
    await expect(page.locator('[name="mfg_raw"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
    await expect(page.locator('#confirm-scan')).not.toBeChecked();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#next-item').click();
    await page.locator('#start-camera').click();
    await chooseCameraField(page, 'Otomatis');
    await page.locator('#capture-image').click();
    await page.locator('#auto-ocr').click();
    await expect(page.locator('#parser-warnings')).toContainText('MFG memiliki beberapa kandidat');
    await expect(page.locator('#ocr-status')).toHaveText('Perlu diperiksa');
    await expect(page.locator('#candidate-options')).toHaveAttribute('open', '');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('');
    await expect(page.locator('[name="mfg_raw"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
});

test('real OCR reads Indonesian MFG and English expiry month names', async ({ page }) => {
    await login(page);
    await newSession(page, `E2E-DATE-NAMES-${Date.now()}`);
    await labelImage(page, ['LOT: DATES123', 'MG: 11 agustus 2026', 'ED: 11 aug 2027']);
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11', { timeout: 90000 });
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-08-11');
    await expect(page.locator('[name="lot_number"]')).toHaveValue('DATES123');
});

for (const withSymbols of [true, false]) test(`real OCR ${withSymbols ? 'uses icons to assign' : 'does not guess types for'} dates without MFG or EXP text`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page);
    await newSession(page, `E2E-SYMBOL-NAMES-${withSymbols}-${Date.now()}`);
    const encoded = await page.evaluate(({ factory, hourglass, withSymbols }) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 340;
        const context = canvas.getContext('2d');
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'black';
        context.font = '40px sans-serif';
        context.textBaseline = 'top';
        [{ pixels: hourglass, text: 'AUG 2031' }, { pixels: factory, text: '11 agustus 2026' }].forEach((row, index) => {
            const top = 65 + index * 125;
            if (withSymbols) row.pixels.forEach((pixels, rowIndex) => [...pixels].forEach((pixel, column) => {
                if (pixel === '#') context.fillRect(60 + column * 3, top + rowIndex * 3, 3, 3);
            }));
            context.fillText(row.text, 145, top + 11);
        });
        return canvas.toDataURL('image/png').split(',')[1];
    }, { factory, hourglass, withSymbols });
    await page.locator('#image-file').setInputFiles({ name: 'symbol-dates.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
    await page.locator('#auto-ocr').click();
    await expect(page.locator('#ocr-progress')).toBeHidden({ timeout: 90000 });
    await expect(page.locator('[name="ocr_raw_text"]')).not.toHaveValue('');
    await expect(page.locator('[name="lot_number"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
    if (withSymbols) {
        await expect(page.locator('[name="mfg_raw"]')).toHaveValue('11 agustus 2026');
        await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11');
        await expect(page.locator('[name="exp_raw"]')).toHaveValue('AUG 2031');
        await expect(page.locator('[name="exp_month"]')).toHaveValue('2031-08');
        await expect(page.locator('[name="exp_month"]')).toBeVisible();
    } else {
        await expect(page.locator('[name="mfg_raw"]')).toHaveValue('');
        await expect(page.locator('[name="mfg_date"]')).toHaveValue('');
        await expect(page.locator('[name="exp_raw"]')).toHaveValue('');
        await expect(page.locator('[name="exp_month"]')).toHaveValue('');
        await expect(page.locator('#ocr-status')).toHaveText('Perlu diperiksa');
    }
    expect(errors).toEqual([]);
});

test('real photo with factory and hourglass symbols fills LOT, MFG candidate and month-only expiry', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page);
    await newSession(page, `E2E-SYMBOL-PHOTO-${Date.now()}`);
    const sessionUrl = page.url().replace('/scanner', '');
    await page.locator('#image-file').setInputFiles('tests/browser/fixtures/symbol-label.png');
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('FC001.1A26811', { timeout: 90000 });
    await expect(page.locator('[name="mfg_raw"]')).toHaveValue('26.08.11');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('');
    await expect(page.locator('[data-date-options="mfg"]')).toHaveAttribute('open', '');
    await expect(page.locator('[name="exp_month"]')).toHaveValue('2031-08');
    await expect(page.locator('[name="exp_month"]')).toBeVisible();
    await expect(page.locator('#parser-warnings')).not.toContainText('Label hanya memiliki bulan dan tahun');
    await expect(page.locator('[data-date-feedback="exp"]')).toContainText('hari tidak ditambahkan');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toBeHidden();
    await page.locator('[data-date-format="mfg"]').selectOption('YY.MM.DD');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('');
    await page.locator('[data-century="mfg"]').selectOption('2000');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2026-08-11');
    await openDetails(page, '#item-details');
    await page.locator('[name="verification_status"]').selectOption('verified');
    await page.locator('#confirm-scan').check();
    const pending = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.data.mfg_date).toBe('2026-08-11');
    expect(result.data.exp_date).toBeNull();
    expect(result.data.exp_month).toBe('2031-08');
    expect(result.data.exp_raw).toBe('2031.08');
    expect(result.warnings).toEqual([]);
    await expect(page.locator('#item-success')).toBeVisible();
    await page.locator('#next-item').click();
    await expect(page.locator('[name="exp_month"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toBeVisible();
    await page.goto(`/receiving-items/${result.data.id}`);
    await expect(page.locator('[name="exp_month"]')).toHaveValue('2031-08');
    await expect(page.locator('[name="exp_month"]')).toBeVisible();
    await page.locator('[name="notes"]').fill('Month precision remains unchanged after editing');
    await page.locator('#confirm-scan').check();
    await page.locator('#save-item').click();
    await expect(page.locator('#item-success')).toBeVisible();
    await page.goto(sessionUrl);
    await expect(page.getByRole('cell', { name: /2031-08 \(bulan\)/ })).toBeVisible();
    const csv = await page.request.get(`${sessionUrl}/export`);
    expect(await csv.text()).toContain('mfg_month,exp_month');
    expect(await csv.text()).not.toContain('2031-08-01');
    expect(errors).toEqual([]);
});

test('month-only scans preserve manual input, switch precision explicitly and clear without a stale value', async ({ page }) => {
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return { text: "EXP: 2031.08", confidence: 95 }; } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-MONTH-${Date.now()}`);
    await labelImage(page);
    await page.locator('[name="exp_date"]').fill('2032-09-15');
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2032-09-15');
    await expect(page.locator('[name="exp_month"]')).toHaveValue('');
    await openDetails(page, '#candidate-options');
    await page.locator('#parser-candidates button').filter({ hasText: '2031.08' }).click();
    await expect(page.locator('[name="exp_month"]')).toHaveValue('2031-08');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
    await openDetails(page, '[data-date-options="exp"]');
    await page.locator('[data-date-precision="exp"]').selectOption('day');
    await expect(page.locator('[name="exp_month"]')).toHaveValue('');
    await page.locator('[data-clear-field="exp"]').click();
    await expect(page.locator('[name="exp_raw"]')).toHaveValue('');
    await expect(page.locator('[name="exp_month"]')).toHaveValue('');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('');
});

test('camera MFG and ED scans preserve dotted dates until the format and century are confirmed', async ({ page }) => {
    await page.route('**/js/scanner/ocr-engine.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'export class OcrEngine { async recognize() { return window.scannerTestResults.shift(); } async terminate() {} }',
    }));
    await login(page);
    await newSession(page, `E2E-DATE-FORMATS-${Date.now()}`);
    await page.evaluate(() => {
        window.scannerTestResults = [
            { text: 'MG: 11 agustus 2026', confidence: 95 },
            { text: 'ED: 11 aug 2027', confidence: 95 },
            { text: '26.08.11', confidence: 95 },
            { text: '27.08.11', confidence: 95 },
        ];
    });
    for (const [index, field] of ['mfg', 'exp', 'mfg', 'exp'].entries()) {
        await page.locator(index === 0 ? '#start-camera' : '#retake').click();
        await chooseCameraField(page, field === 'mfg' ? 'MG / MFG' : 'Expired Date');
        await page.locator('#capture-image').click();
        await page.locator('#auto-ocr').click();
        await expect(page.locator('.crop-card')).toHaveCount(index + 1);
        if (index < 2) {
            await expect(page.locator(`[name="${field}_date"]`)).toHaveValue(field === 'mfg' ? '2026-08-11' : '2027-08-11');
            continue;
        }
        await expect(page.locator(`[name="${field}_raw"]`)).toHaveValue(field === 'mfg' ? '26.08.11' : '27.08.11');
        await expect(page.locator(`[name="${field}_date"]`)).toHaveValue('');
        await expect(page.locator(`[data-date-options="${field}"]`)).toHaveAttribute('open', '');
        await expect(page.locator(`[data-date-feedback="${field}"]`)).toContainText('Tahun dua digit');
        await page.locator(`[data-date-format="${field}"]`).selectOption('YY.MM.DD');
        await page.locator(`[data-interpret-date="${field}"]`).click();
        await expect(page.locator(`[name="${field}_date"]`)).toHaveValue('');
        await page.locator(`[data-century="${field}"]`).selectOption('2000');
        await expect(page.locator(`[name="${field}_date"]`)).toHaveValue(field === 'mfg' ? '2026-08-11' : '2027-08-11');
        await page.locator(`[data-interpret-date="${field}"]`).click();
        await expect(page.locator(`[name="${field}_date"]`)).toHaveValue(field === 'mfg' ? '2026-08-11' : '2027-08-11');
    }
    await page.locator('#confirm-scan').check();
    await page.locator('[data-date-format="exp"]').selectOption('DD.MM.YY');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2011-08-27');
    await expect(page.locator('#confirm-scan')).not.toBeChecked();
    await page.locator('[data-interpret-date="exp"]').click();
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2011-08-27');
    await expect(page.locator('#date-order-warning')).toBeVisible();
    await page.locator('[data-date-format="exp"]').selectOption('YY.MM.DD');
    await page.locator('[data-interpret-date="exp"]').click();
    await expect(page.locator('#date-order-warning')).toBeHidden();
    await page.locator('[data-century="mfg"]').selectOption('1900');
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('1926-08-11');
    await page.locator('[data-century="mfg"]').selectOption('2000');
    await page.locator('[data-interpret-date="mfg"]').click();
    await page.locator('#confirm-scan').check();
    const saved = page.waitForResponse(response => response.url().includes('/items') && response.request().method() === 'POST');
    await page.locator('#save-item').click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const payload = response.request().postDataJSON();
    expect(payload.mfg_raw).toBe('26.08.11');
    expect(payload.mfg_date).toBe('2026-08-11');
    expect(payload.exp_raw).toBe('27.08.11');
    expect(payload.exp_date).toBe('2027-08-11');
});

test('mobile has no page overflow and touch crop uses image coordinates', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await login(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile-dashboard.png', fullPage: true });
    await newSession(page, `E2E-TOUCH-${Date.now()}`);
    await page.locator('#start-camera').click();
    await openDetails(page, '#scan-tools');
    await expect(page.locator('#camera-field-picker')).toBeVisible();
    await chooseCameraField(page, 'Expired Date');
    await expect(page.locator('#capture-image')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile-camera-fields.png', fullPage: true });
    await page.locator('#stop-camera').click();
    await labelImage(page);
    await page.locator('#manual-crop').click();
    const bounds = await page.locator('#crop-overlay').boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bounds.x + 20, y: bounds.y + 20 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bounds.x + bounds.width - 20, y: bounds.y + bounds.height - 20 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#crop-area')).toBeEnabled();
    await page.locator('#crop-area').click();
    await expect(page.locator('#crop-preview canvas')).toBeVisible();
    await openDetails(page, '[data-date-options="mfg"]');
    await page.locator('[data-date-source="mfg"] summary').click();
    await page.locator('[name="mfg_raw"]').fill('26.08.11');
    await expect(page.locator('[data-date-options="mfg"]')).toHaveAttribute('open', '');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile-scanner.png', fullPage: true });
    await context.close();
});

test('admin user form creates a real viewer with read-only access', async ({ page, browser }) => {
    await login(page);
    await page.goto('/users');
    const form = page.locator('.user-create .user-form');
    const viewerEmail = `e2e-viewer-${Date.now()}@example.test`;
    const viewerPassword = `Test${randomBytes(16).toString('hex')}1`;
    await form.locator('[name="name"]').fill('E2E Viewer');
    await form.locator('[name="email"]').fill(viewerEmail);
    await form.locator('[name="password"]').fill(viewerPassword);
    await form.locator('[name="role"]').selectOption('viewer');
    const created = page.waitForResponse(response => response.url().endsWith('/api/users') && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Tambah pengguna' }).click();
    expect((await created).status()).toBe(201);
    const context = await browser.newContext();
    const viewer = await context.newPage();
    await viewer.goto(`${baseURL}/login`);
    await viewer.getByLabel('Email', { exact: true }).fill(viewerEmail);
    await viewer.getByLabel('Password', { exact: true }).fill(viewerPassword);
    await viewer.getByRole('button', { name: 'Masuk ke workspace' }).click();
    await expect(viewer.getByRole('heading', { name: 'Setiap barang, tercatat.' })).toBeVisible();
    await expect(viewer.getByRole('link', { name: 'Penerimaan baru', exact: true })).toHaveCount(0);
    const forbidden = await viewer.evaluate(async () => {
        const response = await fetch('/api/receiving-sessions', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content }, body: '{}' });
        return response.status;
    });
    expect(forbidden).toBe(403);
    const usersPage = await viewer.goto(`${baseURL}/users`);
    expect(usersPage.status()).toBe(403);
    await context.close();
});
