/**
 * projectExportUtils.ts
 *
 * Plain helpers shared by the PDF and Excel exports. Kept free of
 * @react-pdf/renderer and exceljs so the project page can use them
 * without downloading either library up front.
 */

import type { Project } from '../../types/project';

/** Long date for documents; `isoDate` ("YYYY-MM-DD") defaults to today. */
export const pdfDate = (isoDate?: string | null) => {
    const [y, m, d] = (isoDate ?? '').split('-').map(Number);
    const date = y && m && d ? new Date(y, m - 1, d) : new Date();
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

/** Plants grouped by category, categories A→Z. */
export function groupByCategory(plants: Project['plants']) {
    const groups = new Map<string, Project['plants']>();
    for (const pp of plants) {
        if (!pp.plant) continue;
        const cat = pp.plant.category || 'Uncategorized';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(pp);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

/** Triggers a browser download of the rendered file. */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}
