import { apiRequest } from './api-client.js';
import { parseLabel, parseDate, dateOrderWarnings } from './lot-mfg-exp-parser.js';

let singleton;

export function getItemForm() {
    if (!singleton && document.querySelector('#item-form')) singleton = new ItemForm(document.querySelector('#item-form'));
    return singleton;
}

export class ItemForm {
    constructor(form) {
        this.form = form;
        this.itemId = form.dataset.itemId || null;
        this.scans = [];
        this.busy = false;
        this.dirty = false;
        this.onSaved = () => {};
        this.onReset = () => {};
        this.onBusy = () => {};
        this.locked = form.querySelector('fieldset').disabled;
        this.confirmation = form.elements.confirmed;
        this.saveButton = form.querySelector('#save-item');
        form.addEventListener('input', event => {
            if (event.target === this.confirmation) this.syncSave();
            else {
                if (/^(mfg|exp)_raw$/.test(event.target.name)) this.syncDate(event.target.name.replace('_raw', ''));
                this.markDirty();
                this.updateDateFeedback();
            }
        });
        form.addEventListener('change', event => {
            const dateField = event.target.dataset.dateFormat || event.target.dataset.century;
            if (dateField) this.syncDate(dateField);
            if (event.target.dataset.datePrecision) this.setDatePrecision(event.target.dataset.datePrecision, event.target.value);
            if (event.target !== this.confirmation) this.markDirty();
            this.updateDateFeedback();
            this.syncSave();
        });
        form.addEventListener('submit', event => { event.preventDefault(); this.save(); });
        form.querySelector('#parse-text').addEventListener('click', () => this.analyze(this.field('ocr_raw_text').value));
        form.querySelector('#clear-fields').addEventListener('click', () => {
            if (!window.confirm('Kosongkan field hasil scan? Riwayat crop tidak dihapus.')) return;
            for (const name of ['product_name', 'product_reference', 'barcode', 'lot_number', 'mfg_raw', 'mfg_date', 'mfg_month', 'exp_raw', 'exp_date', 'exp_month', 'ocr_raw_text', 'ocr_confidence', 'notes']) this.field(name).value = '';
            for (const field of ['mfg', 'exp']) this.setDatePrecision(field, 'day');
            this.field('verification_status').value = 'needs_review';
            this.markDirty();
            this.updateDateFeedback();
            this.renderCandidates(parseLabel(''));
        });
        form.querySelectorAll('[data-clear-field]').forEach(button => button.addEventListener('click', () => {
            const field = button.dataset.clearField;
            this.field(`${field}_raw`).value = '';
            this.field(`${field}_date`).value = '';
            this.field(`${field}_month`).value = '';
            this.setDatePrecision(field, 'day');
            this.markDirty();
            this.updateDateFeedback();
        }));
        form.querySelectorAll('[data-interpret-date]').forEach(button => button.addEventListener('click', () => {
            const field = button.dataset.interpretDate;
            this.syncDate(field);
            this.markDirty();
            this.updateDateFeedback();
        }));
        form.querySelector('#next-item')?.addEventListener('click', () => {
            if (this.dirty && !window.confirm('Item memiliki perubahan yang belum disimpan. Buang perubahan dan lanjutkan?')) return;
            this.reset();
        });
        for (const field of ['mfg', 'exp']) this.setDatePrecision(field, this.field(`${field}_month`).value ? 'month' : 'day');
        this.updateDateFeedback();
        this.syncSave();
        window.addEventListener('beforeunload', event => {
            if (this.dirty && !this.locked) { event.preventDefault(); event.returnValue = ''; }
        });
    }

    field(name) { return this.form.elements.namedItem(name); }

    markDirty() {
        if (this.locked) return;
        this.dirty = true;
        this.confirmation.checked = false;
        this.form.querySelector('#item-success').hidden = true;
        this.syncSave();
    }

    syncSave() { if (this.saveButton) this.saveButton.disabled = this.busy || !this.confirmation.checked; }

    interpret(field) {
        return parseDate(this.field(`${field}_raw`).value, { format: this.form.querySelector(`[data-date-format="${field}"]`).value, century: this.form.querySelector(`[data-century="${field}"]`).value });
    }

    syncDate(field) {
        const result = this.interpret(field);
        this.setDatePrecision(field, result.month ? 'month' : 'day');
        this.field(`${field}_date`).value = result.date ?? '';
        this.field(`${field}_month`).value = result.month ?? '';
    }

    setDatePrecision(field, precision) {
        this.form.querySelector(`[data-date-precision="${field}"]`).value = precision;
        this.form.querySelector(`[data-date-day="${field}"]`).hidden = precision === 'month';
        this.form.querySelector(`[data-date-month="${field}"]`).hidden = precision !== 'month';
        this.field(`${field}_${precision === 'month' ? 'date' : 'month'}`).value = '';
    }

    updateDateFeedback() {
        for (const field of ['mfg', 'exp']) {
            const result = this.interpret(field);
            const output = this.form.querySelector(`[data-date-feedback="${field}"]`);
            const confirmed = this.field(`${field}_date`).value || this.field(`${field}_month`).value;
            const messages = [...result.warnings];
            if (result.status === 'ambiguous') this.form.querySelector(`[data-date-options="${field}"]`).open = true;
            if (result.date) messages.unshift(`Interpretasi: ${result.date} (${result.candidates[0].format}). Periksa sebelum konfirmasi.`);
            if (confirmed) messages.push(`${confirmed.length === 7 ? 'Bulan/tahun' : 'Tanggal'} yang akan disimpan: ${confirmed}.`);
            else if (result.raw.trim()) messages.push(`Hasil scan: "${result.raw}". Tanggal belum diisi; pastikan format atau koreksi teks asli hasil scan.`);
            if (result.candidates.length > 1) messages.push(`Kandidat: ${result.candidates.map(candidate => `${candidate.date} / ${candidate.format}`).join(' atau ')}.`);
            output.textContent = messages.join(' ');
        }
        const warnings = dateOrderWarnings(this.field('mfg_date').value || this.field('mfg_month').value, this.field('exp_date').value || this.field('exp_month').value);
        const output = this.form.querySelector('#date-order-warning');
        output.textContent = warnings.join(' ');
        output.hidden = !warnings.length;
    }

    fillCandidate(candidate, overwrite = true) {
        if (this.locked) return;
        const field = candidate.field;
        if (field === 'LOT') {
            if (overwrite || !this.field('lot_number').value) this.field('lot_number').value = candidate.raw.slice(0, 255);
        } else {
            const prefix = field.toLowerCase();
            if (overwrite || (!this.field(`${prefix}_raw`).value && !this.field(`${prefix}_date`).value && !this.field(`${prefix}_month`).value)) {
                this.field(`${prefix}_raw`).value = candidate.raw.slice(0, 255);
                this.syncDate(prefix);
            }
        }
        this.markDirty();
        this.updateDateFeedback();
    }

    renderCandidates(parsed) {
        const list = document.querySelector('#parser-candidates');
        if (!list) return;
        list.replaceChildren();
        let count = 0;
        Object.values(parsed.fields).flat().forEach(candidate => {
            count += 1;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'candidate-button';
            button.disabled = this.locked;
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = candidate.field;
            const value = document.createElement('span');
            value.textContent = candidate.raw;
            const confidence = document.createElement('small');
            confidence.textContent = candidate.confidence === null ? 'Pilih' : `${Math.round(candidate.confidence)}% OCR`;
            button.append(badge, value, confidence);
            button.addEventListener('click', () => this.fillCandidate(candidate));
            list.append(button);
        });
        const countElement = document.querySelector('#candidate-count');
        if (countElement) countElement.textContent = `${count} kandidat`;
        const output = document.querySelector('#parser-warnings');
        output.replaceChildren();
        [...parsed.warnings, ...(parsed.unassigned.length ? [`Belum ditetapkan ke field: ${parsed.unassigned.join(', ')}`] : [])].forEach(message => {
            const paragraph = document.createElement('p');
            paragraph.textContent = message;
            output.append(paragraph);
        });
    }

    analyze(text, confidence = null, fill = true, symbols = []) {
        const parsed = parseLabel(text, confidence, symbols);
        if (parsed.raw.trim() && Object.values(parsed.fields).every(candidates => !candidates.length)) {
            parsed.warnings.push('Jenis data belum dikenali. Sertakan penanda LOT/BATCH, MG/MFG, atau ED/EXP pada foto, atau pilih jenis scan secara manual.');
        }
        this.renderCandidates(parsed);
        if (fill && !this.locked) for (const candidates of Object.values(parsed.fields)) if (candidates.length === 1) this.fillCandidate(candidates[0], false);
        return parsed;
    }

    reset() {
        if (this.busy) return;
        this.form.reset();
        this.itemId = null;
        this.scans = [];
        this.dirty = false;
        this.confirmation.checked = false;
        this.form.querySelector('#item-success').hidden = true;
        this.form.querySelector('#item-error').hidden = true;
        if (this.saveButton) this.saveButton.textContent = 'Simpan item';
        this.renderCandidates(parseLabel(''));
        for (const field of ['mfg', 'exp']) this.setDatePrecision(field, this.field(`${field}_month`).value ? 'month' : 'day');
        this.updateDateFeedback();
        this.syncSave();
        this.onReset();
    }

    async save() {
        if (this.busy || this.locked || !this.confirmation.checked || !this.form.reportValidity()) return;
        const body = Object.fromEntries(new FormData(this.form));
        body.confirmed = true;
        body.ocr_confidence = body.ocr_confidence === '' ? null : Number(body.ocr_confidence);
        if (!this.form.dataset.itemId) body.scans = this.scans.map(scan => ({ field_type: scan.field_type, raw_text: scan.raw_text, normalized_text: scan.normalized_text, confidence: scan.confidence, crop_metadata: scan.crop_metadata }));
        this.busy = true;
        this.form.querySelector('fieldset').disabled = true;
        this.onBusy(true);
        this.syncSave();
        const error = this.form.querySelector('#item-error');
        const success = this.form.querySelector('#item-success');
        error.hidden = success.hidden = true;
        try {
            const wasNew = !this.itemId;
            const result = await apiRequest(this.itemId ? `/api/receiving-items/${this.itemId}` : `/api/receiving-sessions/${this.form.dataset.sessionId}/items`, { method: this.itemId ? 'PUT' : 'POST', body });
            this.itemId = result.data.id;
            this.dirty = false;
            this.confirmation.checked = false;
            this.field('verification_status').value = result.data.verification_status;
            success.textContent = [result.message, ...(result.warnings ?? []), this.form.dataset.itemId ? 'Perubahan tersimpan dalam sesi penerimaan.' : 'Pilih Scan item berikutnya untuk melanjutkan.'].join(' ');
            success.hidden = false;
            if (this.saveButton) this.saveButton.textContent = 'Simpan perubahan';
            this.onSaved(result, wasNew);
        } catch (failure) {
            error.textContent = failure.message;
            error.hidden = false;
        } finally {
            this.busy = false;
            this.form.querySelector('fieldset').disabled = this.locked;
            this.onBusy(false);
            this.syncSave();
        }
    }
}
