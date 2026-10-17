import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySymbol, detectSymbolLabels, isNumericDate } from '../../public/js/scanner/symbol-label-detector.js';

const hourglass = [
    '####################', '####################', '##................##', '.#................#.',
    '.#................#.', '.#................#.', '..#..............#..', '..##.##########.#...',
    '...#############....', '....###########.....', '.....#########......', '......#######.......',
    '.....#########......', '....###########.....', '...#############....', '..###############...',
    '.#################..', '.#.#############.#..', '.#.#############.#..', '##.#############.##.',
    '####################', '####################',
];

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
    for (const text of ['26.08.11', '2031.08', '2026-08-11', '11/08/2026']) assert.equal(isNumericDate(text), true);
    for (const text of ['7.0', '9.3', '25', '10', 'FC001.1A26811', '203108']) assert.equal(isNumericDate(text), false);
});

test('dates alone never imply MFG or EXP without visual evidence', () => {
    const canvas = { width: 600, height: 150, getContext: () => ({ getImageData: (left, top, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }) }) };
    const words = [{ text: '26.08.11', confidence: 95, bbox: { x0: 200, y0: 60, x1: 320, y1: 80 } }, { text: '2031.08', confidence: 95, bbox: { x0: 430, y0: 60, x1: 550, y1: 80 } }];
    assert.deepEqual(detectSymbolLabels(canvas, words), []);
    assert.deepEqual(detectSymbolLabels(canvas, []), []);
});
