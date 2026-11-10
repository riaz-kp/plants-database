// Helpers for a project's bulk import page.

/**
 * Lowercase, drop accents and punctuation, collapse spaces — the same as the backend's
 * normalize_name, so 'Hibiscus rosa-sinensis' and 'hibiscus Rosa Sinensis.' compare equal.
 */
export function normalizeName(value: string | null | undefined): string {
    if (!value) return '';
    return value
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Every normalized form of a name: 'Areca Palm (Dypsis lutescens)' → whole, 'areca palm', 'dypsis lutescens'; aliases split on ; / | , */
export function nameVariants(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const parts = [raw, raw.replace(/\([^)]*\)/g, ' '), ...Array.from(raw.matchAll(/\(([^)]*)\)/g), m => m[1])];
    for (const part of [...parts]) parts.push(...part.split(/[;/|,]/));
    return [...new Set(parts.map(normalizeName).filter(Boolean))];
}

const LINE_BREAKS = new RegExp('\\r\\n?|\\n|\\u2028|\\u2029|\\u0085');
/** "1.", "2)", "-", "•", "*" and similar list markers in front of a name */
const LIST_MARKER = /^\s*(?:[-*•·▪◦–—]+|\(?\d+[.)\]:]?)\s+/;

/** Column titles a BOQ / plant schedule header row has, e.g. "S.No ⇥ Plant ⇥ Unit ⇥ Qty" */
const HEADER_CELL = /^(?:s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|no\.?|#|qty\.?|quantity|units?|nos\.?|rate|amount|size|remarks?)$/i;

/** A copied header row: a title like "S.No" or "Qty" and no numbers in any cell */
function isSpreadsheetHeader(line: string): boolean {
    if (!line.includes('\t')) return false;
    const cells = line.split('\t').map(c => c.trim()).filter(Boolean);
    return cells.some(c => HEADER_CELL.test(c)) && !cells.some(c => /^\d+(?:\.\d+)?$/.test(c));
}

/**
 * Turn pasted text into plant names: one per line (or comma-separated on a single line),
 * without list numbering or bullets. A row copied from a spreadsheet keeps its first
 * cell that has letters in it, so "1⇥Areca Palm⇥Nos⇥20" gives "Areca Palm".
 * Repeats (by normalized name) are dropped.
 */
export function parsePlantList(text: string): string[] {
    let lines = text.split(LINE_BREAKS).filter(l => l.trim());
    if (lines.length === 1 && !lines[0].includes('\t') && /[,;]/.test(lines[0])) {
        lines = lines[0].split(/[,;]/);
    }
    const names: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
        if (isSpreadsheetHeader(line)) continue;
        const cell = line.includes('\t')
            ? line.split('\t').find(c => /[a-z].*[a-z]/i.test(c)) ?? ''
            : line;
        const name = cell.replace(LIST_MARKER, '').replace(/^["']+|["']+$/g, '').trim();
        const key = normalizeName(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}

/** Edit distance between two short words */
function editDistance(a: string, b: string): number {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/** Same word, or the same longer word with a typo ('bougenvillea' / 'bougainvillea') */
function wordsClose(a: string, b: string): boolean {
    if (a === b) return true;
    if (a.length < 4 || b.length < 4) return false;
    return editDistance(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 5));
}

const words = (s: string) => s.split(' ').filter(Boolean);
const allIn = (small: string[], big: string[]) => small.every(w => big.some(b => wordsClose(w, b)));

/**
 * Whether a CSV row looks like the plant a pasted name asked for: the same name, or all
 * the words of one inside the other ('bougainvillea' and 'Bougainvillea glabra'), allowing
 * for typos. Only used to warn about names the CSV seems to have left out.
 */
export function rowCoversName(row: Record<string, string>, name: string): boolean {
    const rowKeys = [
        ...nameVariants(row.common_name),
        ...nameVariants(row.scientific_name),
        ...nameVariants([row.genus, row.species].filter(Boolean).join(' ')),
    ];
    return nameVariants(name).some(n => {
        const nWords = words(n);
        return rowKeys.some(k => k === n || allIn(nWords, words(k)) || allIn(words(k), nWords));
    });
}
