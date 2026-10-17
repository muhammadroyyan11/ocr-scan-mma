import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

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

async function labelImage(page) {
    const encoded = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 600;
        const context = canvas.getContext('2d');
        context.fillStyle = 'white';
        context.fillRect(0, 0, 1200, 600);
        context.fillStyle = 'black';
        context.font = 'bold 54px monospace';
        context.fillText('LOT: ABC12345', 60, 150);
        context.fillText('MFG: 2025-12-25', 60, 300);
        context.fillText('EXP: 2027-12-30', 60, 450);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#image-file').setInputFiles({ name: 'label-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
    await expect(page.locator('#image-workspace')).toBeVisible();
}

async function selectCrop(page, top = 0.10, bottom = 0.32) {
    await page.getByRole('button', { name: 'Pilih area', exact: true }).click();
    const bounds = await page.locator('#crop-overlay').boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.025, bounds.y + bounds.height * top);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.88, bounds.y + bounds.height * bottom, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#read-selected')).toBeEnabled();
}

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
    await page.locator('#auto-ocr').click();
    await expect(page.locator('[name="lot_number"]')).toHaveValue('ABC12345', { timeout: 90000 });
    await expect(page.locator('[name="mfg_date"]')).toHaveValue('2025-12-25');
    await expect(page.locator('[name="exp_date"]')).toHaveValue('2027-12-30');
    await expect(page.locator('#ocr-status')).toContainText('Success');
    await selectCrop(page);
    await page.locator('#crop-area').click();
    await expect(page.locator('#crop-preview canvas')).toBeVisible();
    await page.locator('#crop-field').selectOption('LOT');
    await page.locator('#read-selected').click();
    await expect(page.locator('.crop-card')).toHaveCount(1, { timeout: 60000 });
    await expect(page.locator('.crop-card').first()).toContainText('LOT: ABC12345');
    await expect(page.locator('#ocr-status')).toHaveText(/Success|Needs Review/);
    await selectCrop(page, 0.62, 0.82);
    await page.locator('#crop-field').selectOption('EXP');
    await page.locator('#read-selected').click();
    await expect(page.locator('.crop-card')).toHaveCount(2, { timeout: 60000 });
    await expect(page.locator('.crop-card').last()).toContainText('EXP: 2027-12-30');
    await expect(page.locator('#ocr-status')).toHaveText(/Success|Needs Review/);
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

test('fake camera capture, stop and retake release all media tracks', async ({ page }) => {
    await login(page);
    await newSession(page, `E2E-CAMERA-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-field-picker')).toBeVisible();
    await expect(page.locator('#capture-image')).toBeDisabled();
    await page.getByRole('radio', { name: 'LOT', exact: true }).check();
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
    await page.locator('#start-camera').click();
    await expect(page.locator('#scanner-error')).toContainText('Izin kamera ditolak');
    await expect(page.locator('#image-file')).toBeEnabled();
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
        await expect(page.locator('#camera-field-picker')).toBeVisible();
        await page.getByRole('radio', { name: field.choice, exact: true }).check();
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
    await expect(page.locator('#camera-field-picker input:checked')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Expired Date', exact: true }).check();
    await page.locator('#capture-image').click();
    await labelImage(page);
    await expect(page.locator('#auto-ocr')).toContainText('OCR otomatis');
    await expect(page.locator('#crop-field')).toHaveValue('AUTO');
});

test('mobile has no page overflow and touch crop uses image coordinates', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await login(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/mobile-dashboard.png', fullPage: true });
    await newSession(page, `E2E-TOUCH-${Date.now()}`);
    await page.locator('#start-camera').click();
    await expect(page.locator('#camera-field-picker')).toBeVisible();
    await page.getByRole('radio', { name: 'Expired Date', exact: true }).check();
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
