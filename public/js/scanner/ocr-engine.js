let libraryPromise = null;

function loadLibrary() {
    if (typeof window.Tesseract?.createWorker === 'function') return Promise.resolve(window.Tesseract);
    if (!libraryPromise) {
        libraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/vendor/ocr/tesseract.min.js';
            script.async = true;
            script.onload = () => {
                script.remove();
                if (typeof window.Tesseract?.createWorker === 'function') resolve(window.Tesseract);
                else reject(new Error('Library OCR tidak dapat dijalankan. Muat ulang halaman atau coba browser terbaru.'));
            };
            script.onerror = () => {
                script.remove();
                reject(new Error('Gagal memuat /vendor/ocr/tesseract.min.js. Periksa koneksi lalu coba Baca/OCR lagi. Jika file tidak tersedia di server, jalankan npm run vendor:ocr atau rebuild Docker app dan web.'));
            };
            document.head.append(script);
        }).catch(error => {
            libraryPromise = null;
            throw error;
        });
    }
    return libraryPromise;
}

export class OcrEngine {
    constructor(onProgress = () => {}) {
        this.onProgress = onProgress;
        this.workerPromise = null;
        this.busy = false;
    }

    async worker() {
        if (!this.workerPromise) {
            this.onProgress({ status: 'Memuat mesin OCR lokal', progress: 0 });
            this.workerPromise = loadLibrary().then(library => {
                this.onProgress({ status: 'Memuat worker dan bahasa Inggris lokal', progress: 0 });
                return library.createWorker('eng', 1, {
                    workerPath: '/vendor/ocr/worker.min.js',
                    corePath: '/vendor/ocr/core',
                    langPath: '/vendor/ocr/lang',
                    logger: message => this.onProgress(message),
                }).catch(error => {
                    throw new Error(`Worker OCR gagal dimuat. Periksa aset bahasa lokal dan memori perangkat. ${error.message}`);
                });
            }).catch(error => {
                this.workerPromise = null;
                throw error;
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
