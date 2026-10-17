export class OcrEngine {
    constructor(onProgress = () => {}) {
        this.onProgress = onProgress;
        this.workerPromise = null;
        this.busy = false;
    }

    async worker() {
        if (!window.Tesseract) throw new Error('Aset OCR belum tersedia. Rebuild Docker atau jalankan npm run vendor:ocr.');
        if (!this.workerPromise) {
            this.onProgress({ status: 'Memuat worker dan bahasa Inggris lokal', progress: 0 });
            this.workerPromise = window.Tesseract.createWorker('eng', 1, {
                workerPath: '/vendor/ocr/worker.min.js',
                corePath: '/vendor/ocr/core',
                langPath: '/vendor/ocr/lang',
                logger: message => this.onProgress(message),
            }).catch(error => {
                this.workerPromise = null;
                throw new Error(`Worker OCR gagal dimuat. Periksa aset bahasa lokal dan memori perangkat. ${error.message}`);
            });
        }
        return this.workerPromise;
    }

    async recognize(canvas, selected = false) {
        if (this.busy) throw new Error('OCR masih berjalan. Tunggu hingga selesai.');
        this.busy = true;
        try {
            const worker = await this.worker();
            await worker.setParameters({ tessedit_pageseg_mode: selected ? '6' : '11', preserve_interword_spaces: '1' });
            const result = await worker.recognize(canvas);
            return { text: result.data.text.trim(), confidence: result.data.confidence };
        } finally { this.busy = false; }
    }

    async terminate() {
        const promise = this.workerPromise;
        this.workerPromise = null;
        if (promise) { try { await (await promise).terminate(); } catch {} }
    }
}
