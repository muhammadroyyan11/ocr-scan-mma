import { dateAnchors, detectSymbolLabels } from './symbol-label-detector.js';
import { parseLabel } from './lot-mfg-exp-parser.js';

let libraryPromise = null;

export function ocrWords(data, scale = 1, offset = 0) {
    return (data.blocks ?? []).flatMap(block => (block.paragraphs ?? []).flatMap(paragraph => (paragraph.lines ?? []).flatMap(line => (line.words ?? []).map(word => ({
        text: word.text.trim(), confidence: word.confidence,
        bbox: { x0: word.bbox.x0 / scale, y0: word.bbox.y0 / scale + offset, x1: word.bbox.x1 / scale, y1: word.bbox.y1 / scale + offset },
    })))));
}

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
            const result = await worker.recognize(canvas, {}, { blocks: true });
            let text = result.data.text.trim();
            let words = ocrWords(result.data);
            const parsed = parseLabel(text);
            if (!selected && Object.values(parsed.fields).some(values => !values.length)) {
                const anchors = dateAnchors(words);
                const bands = [];
                for (const anchor of anchors) {
                    const height = anchor.bbox.y1 - anchor.bbox.y0;
                    if (height < 6 || bands.some(band => Math.abs(band - anchor.bbox.y0) < height * 3)) continue;
                    bands.push(anchor.bbox.y0);
                    if (bands.length > 2) break;
                    const top = Math.max(0, Math.floor(anchor.bbox.y0 - height * 1.2));
                    const bottom = Math.min(canvas.height, Math.ceil(anchor.bbox.y1 + height * 1.2));
                    const row = document.createElement('canvas');
                    const scale = Math.min(2, 3200 / canvas.width);
                    row.width = Math.round(canvas.width * scale);
                    const actualScale = row.width / canvas.width;
                    row.height = Math.round((bottom - top) * actualScale);
                    row.getContext('2d').drawImage(canvas, 0, top, canvas.width, bottom - top, 0, 0, row.width, row.height);
                    await worker.setParameters({ tessedit_pageseg_mode: '6' });
                    const reread = await worker.recognize(row, {}, { blocks: true });
                    if (reread.data.text.trim()) text += `\n${reread.data.text.trim()}`;
                    const rowWords = ocrWords(reread.data, actualScale, top);
                    words = words.filter(word => !rowWords.some(value => {
                        const overlapWidth = Math.max(0, Math.min(value.bbox.x1, word.bbox.x1) - Math.max(value.bbox.x0, word.bbox.x0));
                        const overlapHeight = Math.max(0, Math.min(value.bbox.y1, word.bbox.y1) - Math.max(value.bbox.y0, word.bbox.y0));
                        return overlapWidth * overlapHeight > (word.bbox.x1 - word.bbox.x0) * (word.bbox.y1 - word.bbox.y0) * 0.5;
                    }));
                    words.push(...rowWords);
                }
            }
            return { text, confidence: result.data.confidence, words, symbols: detectSymbolLabels(canvas, words) };
        } finally { this.busy = false; }
    }

    async terminate() {
        const promise = this.workerPromise;
        this.workerPromise = null;
        if (promise) { try { await (await promise).terminate(); } catch {} }
    }
}
