import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySymbol, dateAnchors, detectSymbolLabels, isNumericDate } from '../../public/js/scanner/symbol-label-detector.js';
import { parseLabel } from '../../public/js/scanner/lot-mfg-exp-parser.js';
import { factory, hourglass } from '../fixtures/date-symbols.js';

function wordLine(texts, { left = 200, top = 60, height = 20, gap = 8 } = {}) {
    return texts.map(text => {
        const width = text.length * 10;
        const word = { text, confidence: 95, bbox: { x0: left, y0: top, x1: left + width, y1: top + height } };
        left += width + gap;
        return word;
    });
}

function symbolCanvas(symbols = []) {
    return {
        width: 1000, height: 300,
        getContext: () => ({ getImageData: (left, top, width, height) => {
            const data = new Uint8ClampedArray(width * height * 4).fill(255);
            for (const symbol of symbols) {
                const scale = symbol.scale ?? 2;
                for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
                    const sourceRow = Math.floor((top + row - symbol.top) / scale);
                    const sourceColumn = Math.floor((left + column - symbol.left) / scale);
                    if (symbol.pixels[sourceRow]?.[sourceColumn] !== '#') continue;
                    const offset = (row * width + column) * 4;
                    data[offset] = data[offset + 1] = data[offset + 2] = 0;
                }
            }
            return { data };
        } }),
    };
}

test('factory shape is classified independently of OCR text', () => {
    assert.equal(classifySymbol(factory.flatMap(row => [...row].map(value => Number(value === '#'))), 20, factory.length).field, 'MFG');
});

test('hourglass shape is classified independently of OCR text', () => {
    const pixels = hourglass.flatMap(row => [...row].map(value => Number(value === '#')));
    assert.equal(classifySymbol(pixels, 20, hourglass.length).field, 'EXP');
    assert.equal(classifySymbol(hourglass.slice().reverse().flatMap(row => [...row].map(value => Number(value === '#'))), 20, hourglass.length).field, 'EXP');
});

test('blank regions, a solid rectangle and crossed lines are not date symbols', () => {
    assert.equal(classifySymbol(new Uint8Array(480), 20, 24), null);
    assert.equal(classifySymbol(new Uint8Array(480).fill(1), 20, 24), null);
    const crossed = Array.from({ length: 480 }, (_, index) => {
        const column = index % 20;
        const row = Math.floor(index / 20);
        return Number(Math.abs(column - row * 19 / 23) < 1 || Math.abs(column - (23 - row) * 19 / 23) < 1);
    });
    assert.equal(classifySymbol(crossed, 20, 24), null);
});

test('numeric dates are anchors but product dimensions and bare numbers are not', () => {
    for (const text of ['26.08.11', '2031.08', '08/2031', '2026-08-11', '11/08/2026', '2026 - 08 - 11']) assert.equal(isNumericDate(text), true);
    for (const text of ['7.0', '9.3', '25', '10', 'FC001.1A26811', '203108']) assert.equal(isNumericDate(text), false);
});

test('date anchors combine OCR tokens using their positions, not the input order', () => {
    for (const texts of [['11', 'agustus', '2026'], ['AUG', '2031'], ['2026', '-', '08', '-', '11'], ['26.', '08.11'], ['08/2031']]) {
        const words = wordLine(texts);
        const anchors = dateAnchors([...words].reverse());
        assert.equal(anchors.length, 1, texts.join(' '));
        assert.equal(anchors[0].text, texts.join(' '));
        assert.deepEqual(anchors[0].bbox, { ...words[0].bbox, x1: words.at(-1).bbox.x1 });
        assert.equal(anchors[0].confidence, 95);
    }
});

test('date anchors do not combine different rows, distant words or low-confidence tokens', () => {
    assert.deepEqual(dateAnchors([...wordLine(['AUG']), ...wordLine(['2031'], { top: 110 })]), []);
    assert.deepEqual(dateAnchors(wordLine(['AUG', '2031'], { gap: 70 })), []);
    const uncertain = wordLine(['11', 'agustus', '2026']);
    uncertain[1].confidence = 20;
    assert.deepEqual(dateAnchors(uncertain), []);
    assert.deepEqual(dateAnchors(wordLine(['7.0', 'mm', '9.3', 'mm', '203108', '20260811', 'FC001.1A26811'])), []);
    assert.deepEqual(dateAnchors([{ text: '2031.08', confidence: 95, bbox: { x0: 200, x1: 300, y0: NaN, y1: 80 } }]), []);
});

test('factory and hourglass icons assign named and split dates without MFG or EXP text', () => {
    const canvas = symbolCanvas([
        { pixels: factory, left: 140, top: 50 },
        { pixels: hourglass, left: 140, top: 148 },
    ]);
    const words = [...wordLine(['11', 'agustus', '2026']), ...wordLine(['AUG', '2031'], { top: 160 })];
    const symbols = detectSymbolLabels(canvas, words);
    assert.deepEqual(symbols.map(value => [value.field, value.raw]), [['MFG', '11 agustus 2026'], ['EXP', 'AUG 2031']]);
    const parsed = parseLabel('11 agustus 2026\nAUG 2031', 95, symbols);
    assert.equal(parsed.fields.MFG[0].date.date, '2026-08-11');
    assert.equal(parsed.fields.EXP[0].date.month, '2031-08');
    assert.equal(parsed.fields.EXP[0].date.date, null);
});

test('icons the same height as the date and close to its first digit are detected', () => {
    for (const [pixels, field] of [[factory, 'MFG'], [hourglass, 'EXP']]) {
        const canvas = symbolCanvas([{ pixels, left: 175, top: 60, scale: 1 }]);
        const symbols = detectSymbolLabels(canvas, wordLine(['2026-08-11']));
        assert.equal(symbols.length, 1, field);
        assert.equal(symbols[0].field, field);
    }
});

test('an icon cannot assign a second date past another date or another row', () => {
    const canvas = symbolCanvas([{ pixels: factory, left: 140, top: 50 }]);
    const symbols = detectSymbolLabels(canvas, [...wordLine(['2031.08', '2032.08']), ...wordLine(['2033.08'], { top: 110 })]);
    assert.deepEqual(symbols.map(value => [value.field, value.raw]), [['MFG', '2031.08']]);
});

test('a date uses the closest icon rather than another icon farther left', () => {
    const canvas = symbolCanvas([
        { pixels: factory, left: 100, top: 50 },
        { pixels: hourglass, left: 155, top: 48 },
    ]);
    assert.equal(detectSymbolLabels(canvas, wordLine(['2031.08']))[0].field, 'EXP');
});

test('dates alone never imply MFG or EXP without visual evidence', () => {
    const canvas = { width: 600, height: 150, getContext: () => ({ getImageData: (left, top, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }) }) };
    const words = [{ text: '26.08.11', confidence: 95, bbox: { x0: 200, y0: 60, x1: 320, y1: 80 } }, { text: '2031.08', confidence: 95, bbox: { x0: 430, y0: 60, x1: 550, y1: 80 } }];
    assert.deepEqual(detectSymbolLabels(canvas, words), []);
    assert.deepEqual(detectSymbolLabels(canvas, []), []);
});
