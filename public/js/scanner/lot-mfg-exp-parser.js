const monthNames = [
    ['JAN', 'JANUARY', 'JANUARI'], ['FEB', 'FEBRUARY', 'FEBRUARI'], ['MAR', 'MARCH', 'MARET'],
    ['APR', 'APRIL'], ['MAY', 'MEI'], ['JUN', 'JUNE', 'JUNI'], ['JUL', 'JULY', 'JULI'],
    ['AUG', 'AUGUST', 'AGU', 'AGT', 'AGST', 'AGUSTUS'], ['SEP', 'SEPT', 'SEPTEMBER'],
    ['OCT', 'OCTOBER', 'OKT', 'OKTOBER'], ['NOV', 'NOVEMBER', 'NOP', 'NOPEMBER'], ['DEC', 'DECEMBER', 'DES', 'DESEMBER'],
];
const monthNumber = value => monthNames.findIndex(names => names.includes(value)) + 1;
const labelPattern = /\b(LOT\s+NUMBER|LOT\s+NO\.?|BATCH\s+NUMBER|BATCH\s+NO\.?|PRODUCTION\s+DATE|PROD\s+DATE|MANUFACTUR(?:ED|ING)(?:\s+DATE)?|MFG\s+DATE|MG\s+DATE|EXPIRATION\s+DATE|EXPIRY(?:\s+DATE)?|EXPIRED(?:\s+DATE)?|EXP\s+DATE|ED\s+DATE|USE\s+BEFORE|BEST\s+BEFORE|USE\s+BY|LOT|BATCH|MFG|MFD|EXP|MG|ED)\b[\s.:#-]*/gi;

function isoDate(year, month, day) {
    if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDate(raw, { format = '', century = null, suggestCorrections = true } = {}) {
    const value = String(raw ?? '').trim().toUpperCase();
    const result = { raw: String(raw ?? ''), date: null, month: null, status: value ? 'unknown' : 'missing', candidates: [], warnings: [], corrections: [] };
    if (!value) return result;
    const add = (year, month, day, interpretation) => {
        const date = isoDate(Number(year), Number(month), Number(day));
        if (date && !result.candidates.some(candidate => candidate.date === date)) result.candidates.push({ date, format: interpretation });
    };
    let matched = false;
    let match;
    if ((match = value.match(/^(\d{4})\s*([./-])\s*(\d{1,2})\s*\2\s*(\d{1,2})$/))) {
        matched = true;
        if (!format || format === 'YYYY-MM-DD') add(match[1], match[3], match[4], 'YYYY-MM-DD');
    } else if ((match = value.match(/^(\d{1,2})\s*([./-])\s*(\d{1,2})\s*\2\s*(\d{4})$/))) {
        matched = true;
        if (!format || format === 'DD/MM/YYYY') add(match[4], match[3], match[1], 'DD/MM/YYYY');
        if (!format || format === 'MM/DD/YYYY') add(match[4], match[1], match[3], 'MM/DD/YYYY');
    } else if ((match = value.match(/^(\d{1,2})\s*([./-])\s*(\d{1,2})\s*\2\s*(\d{2})$/))) {
        matched = true;
        if (!['YY.MM.DD', 'DD.MM.YY', 'MM.DD.YY'].includes(format) || ![1900, 2000, 2100].includes(Number(century))) {
            result.status = 'ambiguous';
            result.warnings.push('Tahun dua digit: pilih urutan YY.MM.DD, DD.MM.YY, atau MM.DD.YY DAN abad secara eksplisit. Berlaku juga untuk pemisah / dan -; tidak ada asumsi tahun.');
            return result;
        }
        if (format === 'YY.MM.DD' && match[1].length === 2) add(Number(century) + Number(match[1]), match[3], match[4], format);
        if (format === 'DD.MM.YY') add(Number(century) + Number(match[4]), match[3], match[1], format);
        if (format === 'MM.DD.YY') add(Number(century) + Number(match[4]), match[1], match[3], format);
    } else if (/^\d{8}$/.test(value)) {
        matched = true;
        if (!format || format === 'DDMMYYYY') add(value.slice(4), value.slice(2, 4), value.slice(0, 2), 'DDMMYYYY');
        if (!format || format === 'YYYYMMDD') add(value.slice(0, 4), value.slice(4, 6), value.slice(6), 'YYYYMMDD');
    } else if (/^\d{6}$/.test(value)) {
        matched = true;
        if (!['YYMMDD', 'DDMMYY'].includes(format) || ![1900, 2000, 2100].includes(Number(century))) {
            result.status = 'ambiguous';
            result.warnings.push('Kode enam digit: pilih YYMMDD atau DDMMYY DAN abad secara eksplisit; tidak ada asumsi tahun.');
            return result;
        }
        if (format === 'YYMMDD') add(Number(century) + Number(value.slice(0, 2)), value.slice(2, 4), value.slice(4), format);
        if (format === 'DDMMYY') add(Number(century) + Number(value.slice(4)), value.slice(2, 4), value.slice(0, 2), format);
    } else if ((match = value.match(/^(\d{1,2})[\s./-]+([A-Z]+)[\s./-]+(\d{4})$/))) {
        matched = true;
        const month = monthNumber(match[2]);
        add(match[3], month, match[1], 'DD MON YYYY');
    } else if ((match = value.match(/^(\d{4})\s*[./-]\s*(\d{1,2})$/)) || (match = value.match(/^(\d{1,2}|[A-Z]+)[\s./-]+(\d{4})$/))) {
        const yearFirst = /^\d{4}/.test(value);
        const year = Number(yearFirst ? match[1] : match[2]);
        const month = yearFirst ? Number(match[2]) : monthNumber(match[1]) || Number(match[1]);
        if (!yearFirst && /^[A-Z]+$/.test(match[1]) && !monthNumber(match[1])) {
            result.warnings.push('Format tanggal belum dikenali. Teks mentah dipertahankan.');
            return result;
        }
        if (!isoDate(year, month, 1)) {
            result.status = 'invalid';
            result.warnings.push('Bulan atau tahun tidak valid.');
            return result;
        }
        result.month = `${year}-${String(month).padStart(2, '0')}`;
        result.status = 'incomplete';
        result.warnings.push('Label hanya memiliki bulan dan tahun. Disimpan sebagai bulan/tahun tanpa menambahkan hari.');
        return result;
    }
    if (result.candidates.length === 1) {
        result.status = 'valid';
        result.date = result.candidates[0].date;
    } else if (result.candidates.length > 1) {
        result.status = 'ambiguous';
        result.warnings.push('Lebih dari satu interpretasi tanggal. Pilih format dan periksa label asli.');
    } else if (matched) {
        result.status = 'invalid';
        result.warnings.push('Tanggal kalender atau format pilihan tidak valid.');
    } else {
        result.warnings.push('Format tanggal belum dikenali. Teks mentah dipertahankan.');
    }
    if (suggestCorrections && /^[0-9OISB/.\s-]+$/.test(value) && /[OISB]/.test(value)) {
        const suggestion = value.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8');
        const interpreted = parseDate(suggestion, { format, century, suggestCorrections: false });
        result.corrections.push({ text: suggestion, candidates: interpreted.candidates, status: interpreted.status });
        result.warnings.push(`Kemungkinan salah baca OCR: "${suggestion}". Saran saja; tidak diterapkan otomatis.`);
    }
    return result;
}

export function dateOrderWarnings(mfg, exp) {
    const earliestMfg = mfg?.length === 7 ? `${mfg}-01` : mfg;
    const latestExp = exp?.length === 7 ? `${exp}-31` : exp;
    return earliestMfg && latestExp && latestExp < earliestMfg ? ['EXP lebih awal dari MFG. Periksa label; nilai tidak diubah.'] : [];
}

export function parseLabel(text, confidence = null, symbols = []) {
    const raw = String(text ?? '').replace(/\r/g, '');
    const matches = [...raw.matchAll(new RegExp(labelPattern.source, 'gi'))];
    const fields = { LOT: [], MFG: [], EXP: [] };
    matches.forEach((match, index) => {
        const keyword = match[1].toUpperCase();
        const field = /^(LOT|BATCH)/.test(keyword) ? 'LOT' : /^(EXP|ED|USE|BEST)/.test(keyword) ? 'EXP' : 'MFG';
        const remaining = raw.slice(match.index + match[0].length, matches[index + 1]?.index ?? raw.length);
        const value = remaining.split('\n').map(part => part.trim()).find(Boolean)?.replace(/[;,|]+$/, '').trim() ?? '';
        if (!value) return;
        fields[field].push({ field, keyword, raw: value, confidence, date: field === 'LOT' ? null : parseDate(value) });
    });
    for (const symbol of symbols) {
        if (!['LOT', 'MFG', 'EXP'].includes(symbol.field) || !symbol.raw?.trim()) continue;
        for (const field of Object.keys(fields)) fields[field] = fields[field].filter(candidate => {
            if (field === symbol.field && candidate.raw === symbol.raw) return false;
            return candidate.raw === symbol.raw || !candidate.raw.split(/\s+/).includes(symbol.raw);
        });
        fields[symbol.field].push({ ...symbol, date: symbol.field === 'LOT' ? null : parseDate(symbol.raw) });
    }
    const warnings = [];
    for (const [field, candidates] of Object.entries(fields)) {
        if (candidates.length > 1) warnings.push(`${field} memiliki beberapa kandidat; pilih secara manual.`);
        candidates.forEach(candidate => warnings.push(...(candidate.date?.warnings ?? [])));
    }
    const unassigned = matches.length ? [] : [...new Set(raw.match(/\b\d{1,4}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}[./-]\d{1,2}\b|\b\d{6,8}\b/g) ?? [])].filter(value => !symbols.some(symbol => symbol.raw === value));
    if (unassigned.length) warnings.push('Kode tanpa keyword ditemukan. Tidak otomatis dianggap MFG atau EXP.');
    if (!raw.trim()) warnings.push('OCR belum menghasilkan teks. Coba crop, preset lain, atau isi manual.');
    warnings.push(...dateOrderWarnings(fields.MFG[0]?.date?.date, fields.EXP[0]?.date?.date));
    return { raw, fields, unassigned, warnings: [...new Set(warnings)] };
}
