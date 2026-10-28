import { parseDate } from './lot-mfg-exp-parser.js';

const templates = {
    MFG: [
        '#####...............', '#####...............', '#####...............', '#####...............',
        '#....#..............', '#....#..............', '#....#..............', '#....#...#..##..##..',
        '#....#.###..##.###..', '#....#.#.#.#.#...#..', '#....##..#...##..#..', '#....#...#...#...#..',
        '#.############...#..', '#................#..', '#.......##.#####.#..', '#..#############.#..',
        '#..#############.#..', '#..#############.#..', '#..################.', '####################',
    ],
    EXP: [
        '####################', '####################', '##................##', '.#................#.',
        '.#................#.', '.#................#.', '..#..............#..', '..##.##########.#...',
        '...#############....', '....###########.....', '.....#########......', '......#######.......',
        '.....#########......', '....###########.....', '...#############....', '..###############...',
        '.#################..', '.#.#############.#..', '.#.#############.#..', '##.#############.##.',
        '####################', '####################',
    ],
};

function normalize(pixels, width, height) {
    const output = new Uint8Array(20 * 24);
    for (let row = 0; row < 24; row += 1) for (let column = 0; column < 20; column += 1) {
        const sourceRow = Math.min(height - 1, Math.floor((row + 0.5) * height / 24));
        const sourceColumn = Math.min(width - 1, Math.floor((column + 0.5) * width / 20));
        output[row * 20 + column] = pixels[sourceRow * width + sourceColumn];
    }
    return output;
}

const references = Object.entries(templates).map(([field, rows]) => ({ field, pixels: normalize(rows.flatMap(row => [...row].map(value => Number(value === '#'))), 20, rows.length) }));
const outlinedFactory = [
    '...#.#..............', '.#..................', '....................', '.#####..............',
    '.#####..............', '.#####..............', '.#####..............', '.#....#.............',
    '.#....#.............', '.#....#..........#..', '.#....#..#...#..##..', '.#....#.##..##..##..',
    '.#....###.##...#.#..', '.#....##..#...#..#..', '.#....#...#...#..#..', '.#.###############..',
    '.#...............#..', '.#..#....#########..', '.#..#############...', '.#..##############..',
    '.#..#############.#.', '.#..################', '#########.##########', '#########...........',
];
references.push({ field: 'MFG', pixels: normalize(outlinedFactory.flatMap(row => [...row].map(value => Number(value === '#'))), 20, 24) });
references.push({ field: 'EXP', pixels: normalize(templates.EXP.slice().reverse().flatMap(row => [...row].map(value => Number(value === '#'))), 20, templates.EXP.length) });

export function classifySymbol(pixels, width, height) {
    const normalized = normalize(pixels, width, height);
    if (normalized.reduce((total, pixel) => total + pixel, 0) > normalized.length * 0.82) return null;
    const matches = references.map(reference => {
        let overlap = 0;
        let total = 0;
        normalized.forEach((pixel, index) => { overlap += pixel && reference.pixels[index]; total += pixel + reference.pixels[index]; });
        return { field: reference.field, score: total ? 2 * overlap / total : 0 };
    });
    const scores = ['MFG', 'EXP'].map(field => matches.filter(match => match.field === field).sort((first, second) => second.score - first.score)[0]).sort((first, second) => second.score - first.score);
    return scores[0].score >= 0.78 && scores[0].score - scores[1].score >= 0.12 ? scores[0] : null;
}

function components(gray, width, height, threshold) {
    const visited = new Uint8Array(gray.length);
    const output = [];
    for (let start = 0; start < gray.length; start += 1) {
        if (visited[start] || gray[start] >= threshold) continue;
        const queue = [start];
        visited[start] = 1;
        let left = width;
        let top = height;
        let right = 0;
        let bottom = 0;
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const position = queue[cursor];
            const column = position % width;
            const row = Math.floor(position / width);
            left = Math.min(left, column); top = Math.min(top, row); right = Math.max(right, column); bottom = Math.max(bottom, row);
            for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
                const nextColumn = column + columnOffset;
                const nextRow = row + rowOffset;
                const next = nextRow * width + nextColumn;
                if (nextColumn < 0 || nextColumn >= width || nextRow < 0 || nextRow >= height || visited[next] || gray[next] >= threshold) continue;
                visited[next] = 1;
                queue.push(next);
            }
        }
        output.push({ left, top, width: right - left + 1, height: bottom - top + 1, positions: queue });
    }
    return output;
}

export function isNumericDate(value) {
    return /^(?:\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}|\d{4}\s*[./-]\s*\d{1,2}|\d{1,2}\s*[./-]\s*\d{4})$/.test(value);
}

export function dateAnchors(words = []) {
    const rows = [];
    const readable = words.filter(word => word.text?.trim() && word.bbox && Object.values(word.bbox).every(Number.isFinite) && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0);
    for (const word of readable.sort((first, second) => first.bbox.y0 - second.bbox.y0)) {
        const box = word.bbox;
        const row = rows.find(value => Math.min(value.bottom, box.y1) > Math.max(value.top, box.y0) && Math.abs((value.top + value.bottom - box.y0 - box.y1) / 2) < Math.max(value.bottom - value.top, box.y1 - box.y0) * 0.6);
        if (row) {
            row.words.push(word);
            row.top = Math.min(row.top, box.y0);
            row.bottom = Math.max(row.bottom, box.y1);
        } else rows.push({ top: box.y0, bottom: box.y1, words: [word] });
    }
    const anchors = [];
    for (const row of rows) {
        row.words.sort((first, second) => first.bbox.x0 - second.bbox.x0);
        for (let start = 0; start < row.words.length; start += 1) {
            let candidate = null;
            let consumed = 0;
            const parts = [];
            for (let end = start; end < Math.min(start + 5, row.words.length); end += 1) {
                const word = row.words[end];
                if (!(word.confidence >= 50)) break;
                if (end > start && word.bbox.x0 - row.words[end - 1].bbox.x1 > (row.bottom - row.top) * 1.5) break;
                parts.push(word);
                const text = parts.map(part => part.text.trim()).join(' ');
                if (!isNumericDate(text) && !/[A-Z]/i.test(text)) continue;
                const parsed = parseDate(text, { suggestCorrections: false });
                if (!isNumericDate(text) && !['valid', 'incomplete', 'ambiguous'].includes(parsed.status)) continue;
                candidate = {
                    text,
                    confidence: Math.min(...parts.map(part => part.confidence)),
                    bbox: { x0: parts[0].bbox.x0, y0: Math.min(...parts.map(part => part.bbox.y0)), x1: Math.max(...parts.map(part => part.bbox.x1)), y1: Math.max(...parts.map(part => part.bbox.y1)) },
                };
                consumed = end - start;
            }
            if (candidate) {
                anchors.push(candidate);
                start += consumed;
            }
        }
    }
    return anchors;
}

export function detectSymbolLabels(canvas, words = []) {
    if (!words.length) return [];
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const detected = [];
    for (const word of dateAnchors(words)) {
        const box = word.bbox;
        const textHeight = box.y1 - box.y0;
        if (textHeight < 6) continue;
        const left = Math.max(0, Math.floor(box.x0 - textHeight * 6));
        const top = Math.max(0, Math.floor(box.y0 - textHeight * 1.4));
        const right = Math.min(canvas.width, Math.floor(box.x0 - Math.max(1, textHeight * 0.1)));
        const bottom = Math.min(canvas.height, Math.ceil(box.y1 + textHeight));
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) continue;
        const image = context.getImageData(left, top, width, height);
        const gray = new Uint8Array(width * height);
        for (let index = 0; index < gray.length; index += 1) gray[index] = image.data[index * 4] * 0.299 + image.data[index * 4 + 1] * 0.587 + image.data[index * 4 + 2] * 0.114;
        const ordered = gray.slice().sort();
        const dark = ordered[Math.floor(ordered.length * 0.02)];
        const background = ordered[Math.floor(ordered.length * 0.9)];
        if (background - dark < 25) continue;
        let best = null;
        for (const fraction of [0.45, 0.6, 0.75, 0.85]) {
            for (const component of components(gray, width, height, dark + (background - dark) * fraction)) {
                if (component.height < textHeight * 0.8 || component.height > textHeight * 2.8 || component.width < textHeight * 0.6 || component.width > textHeight * 2.8) continue;
                const ratio = component.width / component.height;
                if (ratio < 0.3 || ratio > 1.7) continue;
                const pixels = new Uint8Array(component.width * component.height);
                for (const position of component.positions) pixels[(Math.floor(position / width) - component.top) * component.width + position % width - component.left] = 1;
                const match = classifySymbol(pixels, component.width, component.height);
                if (!match || (match.field === 'EXP' && ratio > 0.95) || (match.field === 'MFG' && ratio < 0.7)) continue;
                const center = top + component.top + component.height / 2;
                if (Math.abs(center - (box.y0 + box.y1) / 2) > textHeight * 0.65) continue;
                const distance = box.x0 - (left + component.left + component.width);
                if (!best || distance < best.distance - textHeight * 0.5 || (Math.abs(distance - best.distance) <= textHeight * 0.5 && match.score > best.score)) best = { ...match, distance, bbox: { x0: left + component.left, y0: top + component.top, x1: left + component.left + component.width, y1: top + component.top + component.height } };
            }
        }
        const obstructed = best && words.some(value => value.bbox && /[A-Z\d]/i.test(value.text) && value.bbox.x0 >= best.bbox.x1 && value.bbox.x1 <= box.x0 && Math.abs((value.bbox.y0 + value.bbox.y1 - box.y0 - box.y1) / 2) < textHeight * 0.65);
        if (best && !obstructed && !detected.some(value => value.field === best.field && value.raw === word.text && Math.abs(value.bbox.y0 - box.y0) < textHeight)) {
            detected.push({ field: best.field, raw: word.text, keyword: best.field === 'MFG' ? 'Simbol pabrik' : 'Simbol jam pasir', confidence: Math.min(word.confidence, Math.round(best.score * 100)), bbox: box, symbolBox: best.bbox });
        }
    }
    for (const production of detected.filter(value => value.field === 'MFG')) {
        const expiry = detected.find(value => value.field === 'EXP' && Math.abs(value.bbox.y0 - production.bbox.y0) < production.bbox.y1 - production.bbox.y0);
        if (!expiry) continue;
        const row = words.filter(word => word.bbox && Math.abs(word.bbox.y0 - production.bbox.y0) < (production.bbox.y1 - production.bbox.y0) * 1.2 && word.bbox.x1 < production.symbolBox.x0).sort((first, second) => first.bbox.x0 - second.bbox.x0);
        const marker = row.findIndex(word => /^(?:\[?L[O0]T\]?|\[[O0]T\])[:.]?$/i.test(word.text));
        const codes = marker < 0 ? [] : row.slice(marker + 1).filter(word => /^(?=.*[A-Z])(?=.*\d)[A-Z\d./-]+$/i.test(word.text));
        if (codes.length === 1) detected.push({ field: 'LOT', raw: codes[0].text, keyword: 'LOT pada baris simbol', confidence: codes[0].confidence, bbox: codes[0].bbox });
    }
    return detected;
}
