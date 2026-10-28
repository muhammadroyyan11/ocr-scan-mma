import { Camera } from './camera.js';
import { captureImage, loadImageFile } from './image-capture.js';
import { ImageCropper } from './image-cropper.js';
import { preprocessImage } from './image-preprocessor.js';
import { parseLabel, parseDate } from './lot-mfg-exp-parser.js';
import { getItemForm } from './item-form.js';
import { notify } from '../app.js';

const root = document.querySelector('#scanner');
if (root) initializeScanner();

function initializeScanner() {
    const element = id => document.getElementById(id);
    const form = getItemForm();
    let hasImage = false;
    let processing = false;
    let cameraLoading = false;
    let cameraRequest = 0;
    let cameraFailure = '';
    let loadingImage = false;
    let closing = false;
    let cameraField = 'AUTO';
    let imageField = 'AUTO';
    const fieldLabels = { AUTO: 'Otomatis', LOT: 'LOT', MFG: 'MG / MFG', EXP: 'Expired Date' };
    let savedCount = Number.parseInt(element('saved-count').textContent, 10) || 0;
    const camera = new Camera(element('camera-video'), () => updateControls());
    const cropper = new ImageCropper(element('captured-image'), element('crop-overlay'), () => updateControls());
    let engine = null;

    async function getOcrEngine() {
        if (!engine) {
            let OcrEngine;
            try { ({ OcrEngine } = await import('./ocr-engine.js')); }
            catch { throw new Error('Modul OCR gagal dimuat. Kamera tetap dapat digunakan. Muat ulang halaman; jika masih gagal, rebuild Docker app dan web agar semua file JavaScript tersedia.'); }
            engine = new OcrEngine(message => {
                const percent = Math.round((message.progress ?? 0) * 100);
                element('ocr-progress').querySelector('progress').value = percent;
                element('ocr-progress').querySelector('span').textContent = `${message.status} - ${percent}%`;
            });
        }
        return engine;
    }

    function status(text, style = '') {
        element('ocr-status').textContent = text;
        element('ocr-status').className = `badge ${style}`;
    }

    function showError(error) {
        element('scanner-error').textContent = error.message;
        element('scanner-error').hidden = false;
        status('Ada kendala', 'error');
    }

    function updateControls() {
        const state = camera.state();
        const video = element('camera-video');
        const cameraReady = state.running && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
        video.hidden = !state.running;
        element('camera-placeholder').hidden = state.running || hasImage;
        element('image-workspace').hidden = state.running || !hasImage;
        const cameraStatus = element('camera-status');
        if (cameraStatus) cameraStatus.textContent = cameraLoading ? 'Izinkan kamera jika diminta. Tekan Hentikan untuk membatalkan.' : processing ? 'Sedang membaca label. Tunggu sebentar...' : state.running ? cameraReady ? 'Arahkan ke label, lalu tekan Scan label.' : 'Menunggu gambar dari kamera...' : cameraFailure || (hasImage ? 'Foto siap. Tekan Scan label untuk membaca.' : 'Pilih salah satu cara untuk mulai.');
        const busy = processing || cameraLoading || loadingImage || form.busy;
        for (const id of ['manual-crop', 'retake']) element(id).disabled = !hasImage || busy;
        element('auto-ocr').disabled = busy || (state.running ? !cameraReady : !hasImage);
        for (const id of ['clear-selection', 'crop-area', 'read-selected']) element(id).disabled = !hasImage || !cropper.selection || busy;
        element('start-camera').disabled = busy || state.running;
        element('start-camera').hidden = state.running || hasImage;
        element('auto-ocr').hidden = !state.running && !hasImage;
        element('retake').hidden = !hasImage || state.running;
        element('stop-camera').disabled = !state.running && !cameraLoading;
        element('stop-camera').hidden = !state.running && !cameraLoading;
        element('switch-camera').disabled = busy || !state.running || !state.canSwitch;
        element('switch-camera').hidden = !state.running || !state.canSwitch;
        element('torch-camera').disabled = busy || !state.running || !state.canTorch;
        element('torch-camera').hidden = !state.running || !state.canTorch;
        element('torch-camera').textContent = state.torch ? 'Matikan lampu' : 'Lampu';
        element('camera-field-picker').hidden = !state.running;
        element('camera-field-picker').querySelectorAll('input').forEach(control => { control.disabled = busy; });
        element('camera-field-hint').textContent = cameraField && cameraField !== 'AUTO' ? `Arahkan ke ${fieldLabels[cameraField]}. Hasil hanya mengisi kolom ini.` : 'Otomatis membaca LOT, produksi, dan kedaluwarsa. Tidak perlu memilih satu per satu.';
        element('capture-image').disabled = busy || !cameraReady || !cameraField;
        element('capture-image').textContent = cameraField === 'AUTO' ? 'Ambil foto label' : cameraField ? `Ambil foto ${fieldLabels[cameraField]}` : 'Ambil foto';
        const readField = state.running ? cameraField ?? 'AUTO' : imageField;
        element('auto-ocr').firstChild.textContent = processing ? 'Sedang membaca... ' : readField === 'AUTO' ? 'Scan label ' : `Baca ${fieldLabels[readField]} `;
        element('image-file').disabled = busy;
        element('next-item').disabled = busy;
        element('crop-field').disabled = busy;
        element('preprocess-preset').disabled = busy;
        form.form.querySelector('fieldset').disabled = processing || loadingImage || form.busy;
        element('crop-history').querySelectorAll('input, textarea, select, button').forEach(control => { control.disabled = busy; });
        cropper.enable(hasImage && cropper.enabled && !busy);
    }

    function setImage(canvas, field = 'AUTO', announce = true) {
        imageField = field;
        element('crop-field').value = field;
        hasImage = true;
        cropper.setImage(canvas);
        camera.stop();
        element('camera-video').hidden = true;
        element('camera-placeholder').hidden = true;
        element('image-workspace').hidden = false;
        element('crop-preview').hidden = true;
        element('scanner-error').hidden = true;
        status('Foto siap');
        updateControls();
        if (announce) notify(field === 'AUTO' ? 'Foto siap. Tekan Scan label untuk membaca.' : `Foto ${fieldLabels[field]} siap. Tekan Baca ${fieldLabels[field]}.`);
    }

    async function startCamera(switching = false) {
        if (cameraLoading || processing || loadingImage || form.busy) return;
        const request = ++cameraRequest;
        cameraLoading = true;
        cameraFailure = '';
        updateControls();
        element('scanner-error').hidden = true;
        try {
            if (switching) await camera.switch();
            else await camera.start();
        } catch (failure) {
            if (request === cameraRequest) { cameraFailure = failure.message; showError(failure); }
        } finally {
            if (request === cameraRequest) { cameraLoading = false; updateControls(); }
        }
    }

    element('start-camera').addEventListener('click', () => startCamera());
    element('camera-video').addEventListener('loadeddata', updateControls);
    element('camera-field-picker').addEventListener('change', event => {
        if (event.target.name !== 'camera-field' || !fieldLabels[event.target.value]) return;
        cameraField = event.target.value;
        updateControls();
    });
    element('stop-camera').addEventListener('click', () => {
        cameraRequest += 1;
        cameraLoading = false;
        cameraFailure = '';
        camera.stop();
        element('camera-video').hidden = true;
        element('camera-placeholder').hidden = hasImage;
        element('image-workspace').hidden = !hasImage;
        updateControls();
    });
    element('capture-image').addEventListener('click', () => {
        if (!cameraField || element('capture-image').disabled) return;
        try { setImage(captureImage(element('camera-video')), cameraField); } catch (failure) { showError(failure); }
    });
    element('retake').addEventListener('click', () => startCamera());
    element('switch-camera').addEventListener('click', () => startCamera(true));
    element('torch-camera').addEventListener('click', async () => { try { await camera.toggleTorch(); } catch (failure) { showError(failure); } });
    element('image-file').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        loadingImage = true;
        updateControls();
        try { setImage(await loadImageFile(file)); } catch (failure) { showError(failure); }
        finally { loadingImage = false; event.target.value = ''; updateControls(); }
    });
    element('manual-crop').addEventListener('click', () => {
        camera.stop();
        element('camera-video').hidden = true;
        element('image-workspace').hidden = false;
        cropper.enable();
        element('image-workspace').scrollIntoView({ block: 'center', behavior: 'auto' });
        notify('Tarik kotak mengelilingi teks. Anda bisa memakai mouse atau satu jari.');
    });
    element('clear-selection').addEventListener('click', () => { cropper.clear(); element('crop-preview').hidden = true; });
    element('crop-area').addEventListener('click', () => {
        try {
            const { canvas } = cropper.crop();
            element('crop-preview').replaceChildren(preprocessImage(canvas, element('preprocess-preset').value));
            element('crop-preview').hidden = false;
        } catch (failure) { showError(failure); }
    });

    function applyScan(scan) {
        const parsed = parseLabel(scan.raw_text, scan.confidence);
        form.renderCandidates(parsed);
        if (scan.field_type === 'OTHER') {
            form.field('ocr_raw_text').value = `${form.field('ocr_raw_text').value}\n${scan.normalized_text || scan.raw_text}`.trim().slice(0, 20000);
            form.markDirty();
            return;
        }
        const candidate = parsed.fields[scan.field_type]?.[0] ?? { field: scan.field_type, raw: scan.normalized_text || scan.raw_text, date: scan.field_type === 'LOT' ? null : parseDate(scan.normalized_text || scan.raw_text) };
        form.fillCandidate({ ...candidate, raw: scan.normalized_text || candidate.raw, date: scan.field_type === 'LOT' ? null : parseDate(scan.normalized_text || candidate.raw) });
    }

    function addCropCard(canvas, scan) {
        const card = document.createElement('article');
        card.className = 'crop-card';
        const thumbnail = document.createElement('canvas');
        thumbnail.width = Math.min(canvas.width, 480);
        thumbnail.height = Math.max(1, Math.round(canvas.height * thumbnail.width / canvas.width));
        thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
        const heading = document.createElement('strong');
        heading.textContent = `Area ${form.scans.length} - ${Math.round(scan.confidence)}% keyakinan OCR`;
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Jenis field crop');
        ['LOT', 'MFG', 'EXP', 'OTHER'].forEach(field => select.add(new Option(field, field, false, field === scan.field_type)));
        select.addEventListener('change', () => { scan.field_type = select.value; form.markDirty(); });
        const raw = document.createElement('p');
        raw.className = 'mono';
        raw.textContent = `OCR asli: ${scan.raw_text || '(kosong)'}`;
        const text = document.createElement('textarea');
        text.setAttribute('aria-label', 'Teks crop yang dapat dikoreksi');
        text.maxLength = 2000;
        text.value = scan.normalized_text;
        text.rows = 2;
        text.addEventListener('input', () => { scan.normalized_text = text.value; form.markDirty(); });
        const actions = document.createElement('div');
        actions.className = 'button-row';
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'button secondary';
        apply.textContent = 'Terapkan ke field';
        apply.addEventListener('click', () => applyScan(scan));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button subtle danger-text';
        remove.textContent = 'Hapus catatan crop';
        remove.addEventListener('click', () => { form.scans = form.scans.filter(value => value !== scan); card.remove(); form.markDirty(); });
        actions.append(apply, remove);
        card.append(thumbnail, heading, select, raw, text, actions);
        element('crop-history').append(card);
    }

    async function recognize(selected = false) {
        if (processing || cameraLoading || loadingImage || form.busy) return;
        if (!selected && camera.state().running) {
            try { setImage(captureImage(element('camera-video')), cameraField ?? 'AUTO', false); }
            catch (failure) { showError(failure); return; }
        }
        if (!hasImage) return;
        const targeted = selected || imageField !== 'AUTO';
        if (targeted && form.scans.length >= 30) { showError(new Error('Maksimal 30 catatan crop per item. Hapus catatan yang tidak diperlukan.')); return; }
        processing = true;
        let completed = false;
        const wasCropEnabled = cropper.enabled;
        updateControls();
        camera.stop();
        element('camera-video').hidden = true;
        element('image-workspace').hidden = false;
        element('scanner-error').hidden = true;
        element('ocr-progress').hidden = false;
        status('Membaca...');
        try {
            const crop = selected ? cropper.crop() : { canvas: element('captured-image'), metadata: null };
            const preset = element('preprocess-preset').value;
            const processed = preprocessImage(crop.canvas, preset);
            if (selected) { element('crop-preview').replaceChildren(processed); element('crop-preview').hidden = false; }
            const ocr = await getOcrEngine();
            if (closing) return;
            const result = await ocr.recognize(processed, selected);
            if (closing) return;
            let needsReview = !result.text || result.confidence < 70;
            form.field('ocr_confidence').value = Number(result.confidence).toFixed(2);
            if (!selected) {
                const existing = form.field('ocr_raw_text').value;
                form.field('ocr_raw_text').value = existing && existing !== result.text ? `${existing}\n\n${result.text}`.slice(0, 20000) : result.text.slice(0, 20000);
            }
            if (targeted) {
                const parsed = parseLabel(result.text, result.confidence, result.symbols ?? []);
                const detected = Object.entries(parsed.fields).filter(([, values]) => values.length === 1);
                const choice = selected ? element('crop-field').value : imageField;
                const field = choice === 'AUTO' ? (detected.length === 1 ? detected[0][0] : 'OTHER') : choice;
                const normalized = parsed.fields[field]?.length === 1 ? parsed.fields[field][0].raw : result.text;
                const metadata = crop.metadata ?? { x: 0, y: 0, width: crop.canvas.width, height: crop.canvas.height, image_width: crop.canvas.width, image_height: crop.canvas.height };
                const scan = { field_type: field, raw_text: result.text.slice(0, 2000), normalized_text: normalized.slice(0, 2000), confidence: result.confidence, crop_metadata: { ...metadata, preset } };
                form.scans.push(scan);
                addCropCard(crop.canvas, scan);
                if (result.text.trim()) applyScan(scan);
                if (field === 'MFG' || field === 'EXP') needsReview ||= !parseDate(scan.normalized_text).date;
            } else {
                const parsed = form.analyze(result.text, result.confidence, true, result.symbols ?? []);
                const candidates = Object.values(parsed.fields).flat();
                needsReview ||= !candidates.length || Object.values(parsed.fields).some(values => values.length > 1) || candidates.some(candidate => candidate.date && !candidate.date.date && !candidate.date.month);
            }
            form.markDirty();
            status(needsReview ? 'Perlu diperiksa' : 'Selesai', needsReview ? 'amber' : 'green');
            const hint = element('scan-result-hint');
            if (hint) hint.textContent = needsReview ? 'Periksa kolom yang belum terbaca. Anda bisa memperbaikinya manual atau foto ulang.' : 'Cocokkan LOT dan tanggal dengan label, lalu centang konfirmasi untuk menyimpan.';
            completed = Boolean(result.text.trim());
            if (!result.text) notify('Belum ada teks terbaca. Coba area lebih dekat atau preset lain.', true);
        } catch (failure) { if (!closing) showError(failure); }
        finally {
            processing = false;
            cropper.enable(wasCropEnabled);
            element('ocr-progress').hidden = true;
            updateControls();
        }
        if (completed && !selected && !closing && window.matchMedia('(max-width: 1100px)').matches) {
            const heading = element('scan-result-heading');
            heading?.focus({ preventScroll: true });
            heading?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
    }

    element('auto-ocr').addEventListener('click', () => recognize());
    element('read-selected').addEventListener('click', () => recognize(true));
    form.onSaved = (result, wasNew) => {
        if (wasNew) savedCount += 1;
        element('saved-count').textContent = `${savedCount} item di sesi`;
        const hint = element('scan-result-hint');
        if (hint) hint.textContent = 'Item tersimpan. Tekan Scan item berikutnya untuk melanjutkan.';
        notify('Item tersimpan. Pilih Scan item berikutnya untuk melanjutkan.');
    };
    form.onBusy = () => updateControls();
    form.onReset = () => {
        camera.stop();
        cameraField = 'AUTO';
        imageField = 'AUTO';
        element('camera-field-picker').querySelectorAll('input').forEach(control => { control.checked = control.value === 'AUTO'; });
        element('crop-field').value = 'AUTO';
        hasImage = false;
        cropper.clear();
        cropper.enable(false);
        for (const id of ['captured-image', 'crop-overlay']) { element(id).width = 1; element(id).height = 1; }
        element('crop-history').replaceChildren();
        element('crop-preview').replaceChildren();
        element('crop-preview').hidden = true;
        element('camera-video').hidden = true;
        element('image-workspace').hidden = true;
        element('camera-placeholder').hidden = false;
        element('scanner-error').hidden = true;
        root.querySelectorAll('details').forEach(details => { details.open = false; });
        const hint = element('scan-result-hint');
        if (hint) hint.textContent = 'Hasil akan terisi setelah scan. Anda juga bisa mengisinya manual.';
        status('Siap');
        updateControls();
        element('scanner').scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    window.addEventListener('pagehide', () => { closing = true; cameraRequest += 1; cameraLoading = false; camera.stop(); engine?.terminate(); });
    window.addEventListener('pageshow', () => { closing = false; });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cameraRequest += 1;
            cameraLoading = false;
            camera.stop();
            element('camera-video').hidden = true;
            element('camera-placeholder').hidden = hasImage;
            element('image-workspace').hidden = !hasImage;
        }
    });
    updateControls();
}
