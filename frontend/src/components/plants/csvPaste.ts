// Cleaning for CSV text pasted into the bulk import page.

/** Columns in the import CSV's standard order (matches the backend's STANDARD_HEADER). */
const STANDARD_COLUMN_COUNT = 19;

/** CRLF, lone CR, and the Unicode line/paragraph separators some phones use. */
const LINE_BREAKS = new RegExp('\\r\\n?|\\u2028|\\u2029|\\u0085', 'g');

/** Split one line of CSV into raw fields, keeping any quotes, honouring commas inside quotes. */
function splitCsvFields(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            // "" inside a quoted field is an escaped quote, not the end of the field
            if (inQuotes && line[i + 1] === '"') {
                current += '""';
                i++;
                continue;
            }
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            fields.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    fields.push(current);
    return fields;
}

/**
 * Pull apart a field where one row's last value and the next row's first value were
 * glued together by a space when the line break between them was lost.
 */
function splitGluedField(field: string): [string, string] | null {
    const match = field.startsWith('"')
        ? /^("(?:[^"]|"")*")\s+([\s\S]+)$/.exec(field)
        : /^(\S*)\s+([\s\S]+)$/.exec(field);
    return match ? [match[1], match[2]] : null;
}

/**
 * Copying CSV from a chat app on a phone often turns every line break into a space, so the
 * whole file arrives as one line. Rebuild the rows from the column count: the header's
 * width when there is a header, otherwise the standard 19 columns.
 * Returns null when the text cannot be split into rows of equal width.
 */
function restoreLostLineBreaks(text: string): string | null {
    const fields = splitCsvFields(text);

    let width = STANDARD_COLUMN_COUNT;
    if (/^kingdom$/i.test(fields[0]?.trim() ?? '')) {
        // Header names never contain spaces, so the first field with one is where
        // the header's last name meets the first row's first value.
        const glued = fields.findIndex(f => /\s/.test(f.trim()));
        if (glued === -1) return text; // just a header, nothing to rebuild
        if (glued === 0) return null;
        width = glued + 1;
    }

    // A single row really is one line
    if (fields.length <= width) return text;

    // Each row after the first shares its first field with the previous row's last one,
    // so R rows of W columns give R × (W − 1) + 1 fields.
    if (width < 2 || (fields.length - 1) % (width - 1) !== 0) return null;

    const rows: string[][] = [];
    let row: string[] = [];
    for (let i = 0; i < fields.length; i++) {
        row.push(fields[i]);
        if (row.length === width && i < fields.length - 1) {
            const field = row[width - 1];
            // A row ending in an empty value leaves just " <next row's first value>"
            const parts = splitGluedField(field.trim()) ?? (/^\s/.test(field) ? ['', field.trim()] : null);
            if (!parts) return null;
            row[width - 1] = parts[0];
            rows.push(row);
            row = [parts[1]];
        }
    }
    rows.push(row);
    return rows.map(r => r.join(',')).join('\n');
}

/**
 * Clean pasted CSV before sending it to the preview: drop code fences, normalise line
 * endings, and rebuild rows when the line breaks were lost while copying.
 */
export function cleanPastedCsv(raw: string): { text: string; lostLineBreaks: boolean } {
    const text = raw
        // Phones and some apps use other line-break characters
        .replace(LINE_BREAKS, '\n')
        .trim()
        // AI chats often wrap CSV in a ``` code fence despite being told not to;
        // the fence may sit on the same line as the CSV once line breaks are lost
        .replace(/^```[a-z]*\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

    if (!text || text.includes('\n')) return { text, lostLineBreaks: false };

    const restored = restoreLostLineBreaks(text);
    return restored ? { text: restored, lostLineBreaks: false } : { text, lostLineBreaks: true };
}
