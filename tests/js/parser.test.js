import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel, parseDate, dateOrderWarnings } from '../../public/js/scanner/lot-mfg-exp-parser.js';
import { imagePoint, selectionBounds } from '../../public/js/scanner/image-cropper.js';

test('example 1 preserves lot and never assumes six-digit dates', () => {
    const result = parseLabel('LOT: 51102D011\nMfg: 251218\nExp: 301217', 91);
    assert.equal(result.fields.LOT[0].raw, '51102D011');
    assert.equal(result.fields.MFG[0].date.date, null);
    assert.equal(result.fields.EXP[0].date.status, 'ambiguous');
    assert.equal(result.fields.LOT[0].confidence, 91);
});

test('example 2 supports batch no and separated dates', () => {
    const result = parseLabel('BATCH NO. ABC12345\nMFG DATE: 25/12/2018\nEXPIRY DATE: 30/12/2027');
    assert.equal(result.fields.LOT[0].raw, 'ABC12345');
    assert.equal(result.fields.MFG[0].date.date, '2018-12-25');
    assert.equal(result.fields.EXP[0].date.date, '2027-12-30');
});

test('example 3 supports reversed ordering and MFD', () => {
    const result = parseLabel('EXP 2027-12-30\nLOT A102938\nMFD 2025-12-25');
    assert.equal(result.fields.LOT[0].raw, 'A102938');
    assert.equal(result.fields.MFG[0].date.date, '2025-12-25');
    assert.equal(result.fields.EXP[0].date.date, '2027-12-30');
});

test('labels without optional LOT still parse MFG and EXP without inventing a lot', () => {
    const result = parseLabel('MFG: 2025-12-25\nEXP: 2027-12-30');
    assert.deepEqual(result.fields.LOT, []);
    assert.equal(result.fields.MFG[0].date.date, '2025-12-25');
    assert.equal(result.fields.EXP[0].date.date, '2027-12-30');
    assert.deepEqual(result.warnings, []);
});

test('example 4 supports English month names without inventing a day', () => {
    const result = parseLabel('Manufactured: 25 DEC 2025\nUse Before: DEC 2027\nBatch Number: XYZ001');
    assert.equal(result.fields.MFG[0].date.date, '2025-12-25');
    assert.equal(result.fields.EXP[0].date.status, 'incomplete');
    assert.equal(result.fields.EXP[0].date.date, null);
    assert.equal(result.fields.LOT[0].raw, 'XYZ001');
});

test('unlabeled numeric codes are unassigned', () => {
    const result = parseLabel('251218 301217');
    assert.equal(result.fields.MFG.length, 0);
    assert.equal(result.fields.EXP.length, 0);
    assert.deepEqual(result.unassigned, ['251218', '301217']);
});

test('symbol evidence assigns dates without treating unlabeled numbers as manufacture or expiry', () => {
    const text = '[OT] FC001.1A26811 [lau 26.08.11 X : 2031.08';
    const symbols = [
        { field: 'LOT', raw: 'FC001.1A26811', keyword: 'LOT pada baris simbol', confidence: 85 },
        { field: 'MFG', raw: '26.08.11', keyword: 'Simbol pabrik', confidence: 90 },
        { field: 'EXP', raw: '2031.08', keyword: 'Simbol jam pasir', confidence: 90 },
    ];
    const result = parseLabel(text, 80, symbols);
    assert.equal(result.raw, text);
    assert.equal(result.fields.LOT[0].raw, 'FC001.1A26811');
    assert.equal(result.fields.MFG[0].date.status, 'ambiguous');
    assert.equal(result.fields.MFG[0].date.date, null);
    assert.equal(result.fields.EXP[0].date.month, '2031-08');
    assert.equal(result.fields.EXP[0].date.date, null);
    assert.deepEqual(result.unassigned, []);
    assert.equal(parseLabel(text).fields.MFG.length, 0);
    assert.equal(parseLabel(text).fields.EXP.length, 0);
});

test('symbol evidence splits a LOT row without swallowing adjacent dates or duplicating keywords', () => {
    const result = parseLabel('LOT FC001.1A26811 26.08.11 2031.08\nEXP 2031.08', 90, [
        { field: 'LOT', raw: 'FC001.1A26811', keyword: 'LOT', confidence: 90 },
        { field: 'MFG', raw: '26.08.11', keyword: 'Simbol pabrik', confidence: 90 },
        { field: 'EXP', raw: '2031.08', keyword: 'Simbol jam pasir', confidence: 90 },
    ]);
    assert.equal(result.fields.LOT.length, 1);
    assert.equal(result.fields.LOT[0].raw, 'FC001.1A26811');
    assert.equal(result.fields.EXP.length, 1);
    assert.equal(result.fields.MFG.length, 1);
});

test('symbol dates do not remove a legitimate lot containing the same characters', () => {
    const result = parseLabel('LOT ABC2031.08XYZ', 90, [{ field: 'EXP', raw: '2031.08', keyword: 'Simbol jam pasir', confidence: 90 }]);
    assert.equal(result.fields.LOT[0].raw, 'ABC2031.08XYZ');
});

test('month precision supports year-first, month-first and named months without inventing a day', () => {
    for (const raw of ['2031.08', '2031/08', '2031-08', '08/2031', 'AUG 2031', 'AGUSTUS 2031']) {
        const result = parseDate(raw);
        assert.equal(result.month, '2031-08', raw);
        assert.equal(result.date, null, raw);
    }
    for (const raw of ['2031.13', '2031.00', '2031.99', '0999.08']) {
        assert.equal(parseDate(raw).status, 'invalid', raw);
        assert.equal(parseDate(raw).month, null, raw);
    }
    assert.deepEqual(dateOrderWarnings('2026-08-11', '2026-08'), []);
    assert.equal(dateOrderWarnings('2026-09-01', '2026-08').length, 1);
    assert.deepEqual(dateOrderWarnings('2026-08', '2026-08-01'), []);
});

test('keywords on one line and multiple candidates', () => {
    const result = parseLabel('EXP: 2027-12-30 LOT: ABC123 MFG: 2025-12-25\nLOT: XYZ');
    assert.equal(result.fields.LOT.length, 2);
    assert.equal(result.fields.LOT[0].raw, 'ABC123');
    assert.equal(result.fields.MFG[0].date.date, '2025-12-25');
    assert.ok(result.warnings.some(warning => warning.includes('beberapa kandidat')));
});

for (const keyword of ['LOT', 'LOT NO', 'LOT NUMBER', 'BATCH', 'BATCH NO', 'BATCH NUMBER']) test(`keyword ${keyword}`, () => assert.equal(parseLabel(`${keyword}: AB01S8`).fields.LOT[0].raw, 'AB01S8'));
for (const keyword of ['MFG', 'MFD', 'MFG DATE', 'MANUFACTURED', 'PROD DATE', 'PRODUCTION DATE']) test(`keyword ${keyword}`, () => assert.equal(parseLabel(`${keyword}: 2025-12-25`).fields.MFG[0].date.date, '2025-12-25'));
for (const keyword of ['EXP', 'EXP DATE', 'EXPIRY', 'EXPIRATION DATE', 'USE BY', 'USE BEFORE', 'BEST BEFORE']) test(`keyword ${keyword}`, () => assert.equal(parseLabel(`${keyword}: 2027-12-30`).fields.EXP[0].date.date, '2027-12-30'));

test('DD/MM/YYYY vs MM/DD/YYYY ambiguity is explicit', () => {
    const result = parseDate('03/04/2025');
    assert.equal(result.status, 'ambiguous');
    assert.equal(result.date, null);
    assert.equal(result.candidates.length, 2);
    assert.equal(parseDate('03/04/2025', { format: 'DD/MM/YYYY' }).date, '2025-04-03');
    assert.equal(parseDate('03/04/2025', { format: 'MM/DD/YYYY' }).date, '2025-03-04');
});

test('two-digit year requires format and century', () => {
    assert.equal(parseDate('251218', { format: 'YYMMDD' }).date, null);
    assert.equal(parseDate('251218', { century: 2000 }).date, null);
    assert.equal(parseDate('251218', { format: 'YYMMDD', century: 2000 }).date, '2025-12-18');
    assert.equal(parseDate('251218', { format: 'DDMMYY', century: 2000 }).date, '2018-12-25');
    assert.equal(parseDate('251218', { format: 'DDMMYY', century: 1900 }).date, '1918-12-25');
});

test('calendar validation includes leap years', () => {
    for (const value of ['2025-02-29', '2025-04-31', '31/11/2025', '2025-13-01', '2025-00-12', '2025-12-00']) assert.equal(parseDate(value).status, 'invalid', value);
    assert.equal(parseDate('2024-02-29').date, '2024-02-29');
    assert.equal(parseDate('1900-02-29').date, null);
    assert.equal(parseDate('2000-02-29').date, '2000-02-29');
});

test('compact and named dates are supported', () => {
    assert.equal(parseDate('25122025').date, '2025-12-25');
    assert.equal(parseDate('25-12-2025').date, '2025-12-25');
    assert.equal(parseDate('25 December 2025').date, '2025-12-25');
    assert.equal(parseDate('25 DECORATION 2025').date, null);
    assert.equal(parseDate('DECORATION 2027').status, 'unknown');
});

test('Indonesian and English month names and abbreviations preserve the scanned text', () => {
    const examples = [
        ['Januari', 'Jan', 'January'], ['Februari', 'Feb', 'February'], ['Maret', 'Mar', 'March'],
        ['April', 'Apr'], ['Mei', 'May'], ['Juni', 'Jun', 'June'], ['Juli', 'Jul', 'July'],
        ['agustus', 'aug', 'AGU', 'AGT', 'AGST', 'August'], ['September', 'Sept', 'Sep'],
        ['Oktober', 'Okt', 'October', 'Oct'], ['November', 'Nov'], ['Desember', 'Des', 'December', 'Dec'],
    ];
    for (const [month, names] of examples.entries()) {
        for (const name of names) {
            const raw = `11 ${name} 2026`;
            const result = parseDate(raw);
            assert.equal(result.date, `2026-${String(month + 1).padStart(2, '0')}-11`, raw);
            assert.equal(result.raw, raw);
        }
    }
    assert.equal(parseDate('11-Agustus-2026').date, '2026-08-11');
    assert.equal(parseDate('11 AUG. 2026').date, '2026-08-11');
    assert.equal(parseDate('11\nagustus\n2026').date, '2026-08-11');
    assert.equal(parseDate('11 AGUSTUSS 2026').date, null);
});

test('dotted, slashed and dashed full-year dates validate calendar and ambiguity', () => {
    for (const separator of ['.', '/', '-']) {
        assert.equal(parseDate(`2026${separator}08${separator}11`).date, '2026-08-11');
        assert.equal(parseDate(`25${separator}08${separator}2026`).date, '2026-08-25');
        assert.equal(parseDate(`11${separator}08${separator}2026`).status, 'ambiguous');
        assert.equal(parseDate(`11${separator}08${separator}2026`, { format: 'DD/MM/YYYY' }).date, '2026-08-11');
        assert.equal(parseDate(`11${separator}08${separator}2026`, { format: 'MM/DD/YYYY' }).date, '2026-11-08');
        assert.equal(parseDate(`31${separator}02${separator}2026`).status, 'invalid');
    }
    assert.equal(parseDate('2026 . 08 . 11').date, '2026-08-11');
    assert.equal(parseDate('2026.08-11').date, null);
    assert.equal(parseDate('2026.08.11', { format: 'DD/MM/YYYY' }).date, null);
});

test('separated two-digit years require both an explicit format and century', () => {
    for (const raw of ['26.08.11', '26/08/11', '26-08-11']) {
        assert.equal(parseDate(raw).status, 'ambiguous');
        assert.equal(parseDate(raw).date, null);
        assert.equal(parseDate(raw, { format: 'YY.MM.DD' }).date, null);
        assert.equal(parseDate(raw, { century: 2000 }).date, null);
        assert.equal(parseDate(raw, { format: 'YY.MM.DD', century: 2000 }).date, '2026-08-11');
        assert.equal(parseDate(raw, { format: 'DD.MM.YY', century: 2000 }).date, '2011-08-26');
        assert.equal(parseDate(raw, { format: 'YY.MM.DD', century: 1900 }).date, '1926-08-11');
        assert.equal(parseDate(raw, { format: 'YY.MM.DD', century: 2100 }).date, '2126-08-11');
        assert.equal(parseDate(raw, { format: 'YY.MM.DD', century: 1800 }).date, null);
    }
    assert.equal(parseDate('08.11.26', { format: 'MM.DD.YY', century: 2000 }).date, '2026-08-11');
    assert.equal(parseDate('26.02.29', { format: 'YY.MM.DD', century: 2000 }).status, 'invalid');
    assert.equal(parseDate('24.02.29', { format: 'YY.MM.DD', century: 2000 }).date, '2024-02-29');
});

test('month-only dates never invent a day for either language or numeric separators', () => {
    for (const raw of ['AGUSTUS 2026', 'Aug 2026', 'DES.2026', '08.2026', '08/2026']) {
        assert.equal(parseDate(raw).status, 'incomplete', raw);
        assert.equal(parseDate(raw).date, null, raw);
    }
    assert.equal(parseDate('31 Februari 2026').status, 'invalid');
    assert.equal(parseDate('29 Februari 2024').date, '2024-02-29');
});

test('MG, ED and Expired Date labels route dates to MFG and EXP without touching LOT', () => {
    const result = parseLabel('MG: 11 agustus 2026\nED: 11 aug 2027\nLOT: MGED26.08.11');
    assert.equal(result.fields.MFG[0].raw, '11 agustus 2026');
    assert.equal(result.fields.MFG[0].date.date, '2026-08-11');
    assert.equal(result.fields.EXP[0].raw, '11 aug 2027');
    assert.equal(result.fields.EXP[0].date.date, '2027-08-11');
    assert.equal(result.fields.LOT[0].raw, 'MGED26.08.11');
    assert.equal(parseLabel('Expired Date: 11 aug 2026').fields.EXP[0].date.date, '2026-08-11');
    assert.equal(parseLabel('MG 26.08.11 ED 27.08.11').fields.MFG[0].date.status, 'ambiguous');
    assert.deepEqual(parseLabel('26.08.11').unassigned, ['26.08.11']);
    assert.equal(parseLabel('26.08.11').fields.EXP.length, 0);
});

test('date order warnings never rewrite values', () => {
    const result = parseLabel('EXP 2024-12-25 MFG 2025-12-25');
    assert.ok(result.warnings.some(warning => warning.includes('lebih awal')));
    assert.equal(result.fields.EXP[0].date.date, '2024-12-25');
    assert.equal(dateOrderWarnings('', '2024-12-25').length, 0);
});

test('missing dates and empty OCR are handled', () => {
    assert.equal(parseDate(null).status, 'missing');
    assert.equal(parseLabel(null).fields.LOT.length, 0);
    assert.equal(parseLabel('LOT ABC123').fields.MFG.length, 0);
    assert.ok(parseLabel('').warnings.length > 0);
});

test('OCR confusions are contextual suggestions only', () => {
    assert.equal(parseLabel('LOT OI5SB80').fields.LOT[0].raw, 'OI5SB80');
    const result = parseDate('2O25-12-3O');
    assert.equal(result.date, null);
    assert.equal(result.raw, '2O25-12-3O');
    assert.equal(result.corrections[0].text, '2025-12-30');
    assert.equal(parseDate('2O25-12-3O').corrections[0].candidates[0].date, '2025-12-30');
    const dotted = parseDate('2O26.O8.11');
    assert.equal(dotted.date, null);
    assert.equal(dotted.raw, '2O26.O8.11');
    assert.equal(dotted.corrections[0].candidates[0].date, '2026-08-11');
});

test('touch and mouse map displayed coordinates into original pixels', () => {
    const rectangle = { left: 100, top: 50, width: 400, height: 200 };
    assert.deepEqual(imagePoint(300, 150, rectangle, 2000, 1000), { x: 1000, y: 500 });
    assert.deepEqual(imagePoint(0, 9999, rectangle, 2000, 1000), { x: 0, y: 1000 });
    assert.deepEqual(selectionBounds({ x: 1600, y: 800 }, { x: 100, y: 50 }, 2000, 1000), { x: 100, y: 50, width: 1500, height: 750, image_width: 2000, image_height: 1000 });
});
