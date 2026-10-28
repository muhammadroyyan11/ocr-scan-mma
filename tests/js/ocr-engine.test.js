import test from 'node:test';
import assert from 'node:assert/strict';

async function environment(context) {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const scripts = [];
    globalThis.window = {};
    globalThis.document = {
        createElement: () => ({ removed: false, remove() { this.removed = true; } }),
        head: { append: script => scripts.push(script) },
    };
    context.after(() => {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    });
    const moduleUrl = new URL('../../public/js/scanner/ocr-engine.js', import.meta.url);
    moduleUrl.searchParams.set('test', context.name);
    const { OcrEngine } = await import(moduleUrl.href);
    return { engine: new OcrEngine(), OcrEngine, scripts };
}

test('OCR waits for the local library before creating a worker', async context => {
    const { engine, scripts } = await environment(context);
    const worker = {};
    let parameters;
    const pending = engine.worker();
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, '/vendor/ocr/tesseract.min.js');
    window.Tesseract = { createWorker: async (...args) => { parameters = args; return worker; } };
    scripts[0].onload();
    assert.equal(await pending, worker);
    assert.equal(parameters[0], 'eng');
    assert.equal(parameters[2].workerPath, '/vendor/ocr/worker.min.js');
    assert.equal(parameters[2].corePath, '/vendor/ocr/core');
    assert.equal(parameters[2].langPath, '/vendor/ocr/lang');
    assert.equal(scripts[0].removed, true);
    assert.equal(await engine.worker(), worker);
    assert.equal(scripts.length, 1);
});

test('OCR reuses an already available library without adding a script', async context => {
    const { engine, scripts } = await environment(context);
    const worker = {};
    window.Tesseract = { createWorker: async () => worker };
    assert.equal(await engine.worker(), worker);
    assert.equal(scripts.length, 0);
});

test('concurrent engines share one library download', async context => {
    const { engine, OcrEngine, scripts } = await environment(context);
    const secondEngine = new OcrEngine();
    const pending = Promise.all([engine.worker(), engine.worker(), secondEngine.worker()]);
    assert.equal(scripts.length, 1);
    let created = 0;
    window.Tesseract = { createWorker: async () => ({ number: ++created }) };
    scripts[0].onload();
    const workers = await pending;
    assert.equal(created, 2);
    assert.equal(workers[0], workers[1]);
    assert.notEqual(workers[0], workers[2]);
});

test('a failed library download can be retried without reloading the page', async context => {
    const { engine, scripts } = await environment(context);
    const failed = engine.worker();
    scripts[0].onerror();
    await assert.rejects(failed, /Gagal memuat \/vendor\/ocr\/tesseract.min.js/);
    assert.equal(scripts[0].removed, true);
    const retry = engine.worker();
    assert.equal(scripts.length, 2);
    const worker = {};
    window.Tesseract = { createWorker: async () => worker };
    scripts[1].onload();
    assert.equal(await retry, worker);
});

test('an invalid library reports an error and can be retried', async context => {
    const { engine, scripts } = await environment(context);
    const failed = engine.worker();
    scripts[0].onload();
    await assert.rejects(failed, /Library OCR tidak dapat dijalankan/);
    const retry = engine.worker();
    assert.equal(scripts.length, 2);
    const worker = {};
    window.Tesseract = { createWorker: async () => worker };
    scripts[1].onload();
    assert.equal(await retry, worker);
});

test('worker creation failures remain retryable', async context => {
    const { engine, scripts } = await environment(context);
    window.Tesseract = { createWorker: async () => { throw new Error('Worker download failed'); } };
    await assert.rejects(engine.worker(), /Worker OCR gagal dimuat/);
    assert.equal(engine.workerPromise, null);
    const worker = {};
    window.Tesseract.createWorker = async () => worker;
    assert.equal(await engine.worker(), worker);
    assert.equal(scripts.length, 0);
});

test('leaving the scanner while the library loads still terminates the worker', async context => {
    const { engine, scripts } = await environment(context);
    let terminated = false;
    const pending = engine.worker();
    const closing = engine.terminate();
    assert.equal(engine.workerPromise, null);
    window.Tesseract = { createWorker: async () => ({ terminate: async () => { terminated = true; } }) };
    scripts[0].onload();
    await pending;
    await closing;
    assert.equal(terminated, true);
});

test('recognition requests bounding boxes and preserves text without symbol evidence', async context => {
    const { engine } = await environment(context);
    let output;
    window.Tesseract = { createWorker: async () => ({
        setParameters: async () => {},
        recognize: async (canvas, options, requestedOutput) => {
            output = requestedOutput;
            return { data: { text: 'LOT A123\n', confidence: 95 } };
        },
    }) };
    const result = await engine.recognize({}, true);
    assert.deepEqual(output, { blocks: true });
    assert.equal(result.text, 'LOT A123');
    assert.deepEqual(result.symbols, []);
    assert.equal(engine.busy, false);
});

test('automatic OCR rereads a split named date and maps its words back to the original image', async context => {
    const { engine } = await environment(context);
    const words = [
        { text: '11', confidence: 95, bbox: { x0: 200, y0: 60, x1: 220, y1: 80 } },
        { text: 'agustus', confidence: 95, bbox: { x0: 228, y0: 60, x1: 298, y1: 80 } },
        { text: '2026', confidence: 95, bbox: { x0: 306, y0: 60, x1: 346, y1: 80 } },
    ];
    let calls = 0;
    const draws = [];
    document.createElement = () => ({ getContext: () => ({ drawImage: (...args) => draws.push(args) }) });
    window.Tesseract = { createWorker: async () => ({
        setParameters: async () => {},
        recognize: async () => {
            calls += 1;
            const recognized = calls === 1 ? words : words.map(word => ({ ...word, bbox: { x0: word.bbox.x0 * 2, y0: (word.bbox.y0 - 36) * 2, x1: word.bbox.x1 * 2, y1: (word.bbox.y1 - 36) * 2 } }));
            return { data: { text: '11 agustus 2026', confidence: 95, blocks: [{ paragraphs: [{ lines: [{ words: recognized }] }] }] } };
        },
    }) };
    const canvas = { width: 600, height: 200, getContext: () => ({ getImageData: (left, top, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }) }) };
    const result = await engine.recognize(canvas);
    assert.equal(calls, 2);
    assert.equal(draws.length, 1);
    assert.deepEqual(draws[0], [canvas, 0, 36, 600, 68, 0, 0, 1200, 136]);
    assert.deepEqual(result.words, words);
    assert.deepEqual(result.symbols, []);
    assert.equal(engine.busy, false);
});
