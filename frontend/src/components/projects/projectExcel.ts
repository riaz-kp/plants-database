/**
 * projectExcel.ts
 *
 * BOQ and quotation workbooks for a project: branded header with the project
 * details, category-grouped plant table with thumbnails, live formulas for
 * amounts/totals, frozen headers and an A4 print setup.
 */

import ExcelJS from 'exceljs';
import type { Project } from '../../types/project';
import { imgToDataUrl } from '../../utils/pdf-images';
import { groupByCategory, downloadBlob } from './ProjectPdfShared';

const X = {
    primary: 'FF1B3B2B',
    accent: 'FF2D5A27',
    sage: 'FF6F8A6C',
    muted: 'FF6B726A',
    mutedBg: 'FFF4F2ED',
    tint: 'FFEEF3EC',
    border: 'FFE2DDD3',
    rowAlt: 'FFFAFAF7',
    white: 'FFFFFFFF',
    ink: 'FF1C2A1A',
};
const FONT = 'Arial';
const QTY_FMT = '#,##0.##';
const MONEY_FMT = '#,##0.00';

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = (argb = X.border): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb } });

interface Column {
    header: string;
    width: number;
    align: 'left' | 'center' | 'right';
    numFmt?: string;
}

type PlantRow = Project['plants'][number];

interface SheetSpec {
    title: string;
    sheetName: string;
    columns: Column[];
    /** Cell values for one plant row, by column index; `rowIdx` is the Excel row number. */
    rowValues: (pp: PlantRow, rowIdx: number) => ExcelJS.CellValue[];
    /** Adds the total rows starting at `rowIdx`; `dataRows` are the plant row numbers. */
    addTotals: (ws: ExcelJS.Worksheet, rowIdx: number, dataRows: number[]) => void;
    footerLabel: string;
}

const HEADER_ROW = 6;

/** Excel's header/footer codes treat "&" specially. */
const escapeHf = (s: string) => s.replace(/&/g, '&&');

const colLetter = (n: number) => String.fromCharCode(64 + n);

/** Approximate on-screen width of an Excel column (width is in characters). */
const columnPx = (width: number) => Math.round(width * 7 + 5);

/** Fractional column index (0-based) at which something `px` wide ends flush with the last column. */
function anchorFromRight(columns: Column[], px: number): number {
    const widths = columns.map(c => columnPx(c.width));
    let x = widths.reduce((a, b) => a + b, 0) - px;
    for (let i = 0; i < widths.length; i++) {
        if (x < widths[i]) return i + Math.max(0, x) / widths[i];
        x -= widths[i];
    }
    return widths.length - 1;
}

async function fetchLogo(): Promise<ArrayBuffer | null> {
    try {
        const res = await fetch('/logo-pdf.png');
        return res.ok ? await res.arrayBuffer() : null;
    } catch {
        return null;
    }
}

/**
 * Square JPEG thumbnail of an image data URL. Keeps workbooks small (photos are
 * often several hundred KB) and converts formats Excel can't embed, like WebP.
 */
function toThumbnail(dataUrl: string, size = 96): Promise<string | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

/** Plant id → thumbnail data URL, for every plant with an icon (or main image). */
async function plantThumbnails(project: Project): Promise<Map<string, string>> {
    const thumbs = new Map<string, string>();
    await Promise.all(project.plants.map(async pp => {
        const p = pp.plant;
        if (!p) return;
        const src = await imgToDataUrl(p.icon_url || p.image_url);
        const thumb = src ? await toThumbnail(src) : null;
        if (thumb) thumbs.set(p.id, thumb);
    }));
    return thumbs;
}

async function buildWorkbook(project: Project, dateStr: string, spec: SheetSpec): Promise<ExcelJS.Workbook> {
    const [thumbs, logo] = await Promise.all([plantThumbnails(project), fetchLogo()]);
    const groups = groupByCategory(project.plants);
    const n = spec.columns.length;
    const last = colLetter(n);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Landschaft';
    wb.title = `${project.name} — ${spec.title}`;
    const ws = wb.addWorksheet(spec.sheetName, {
        views: [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: 3, showGridLines: false }],
        pageSetup: {
            paperSize: 9, // A4
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
            printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
        },
        headerFooter: {
            oddFooter: `&L&"Arial"&8Landschaft · ${escapeHf(spec.footerLabel)}&R&"Arial"&8Page &P of &N`,
        },
    });
    ws.columns = spec.columns.map(c => ({ width: c.width }));

    // ── Title block ──────────────────────────────────────────────────────────
    ws.getRow(1).height = 18;
    ws.getRow(2).height = 28;
    ws.mergeCells(`A1:${colLetter(n - 2)}1`);
    ws.mergeCells(`A2:${colLetter(n - 2)}2`);
    Object.assign(ws.getCell('A1'), {
        value: spec.title,
        font: { name: FONT, size: 9, bold: true, color: { argb: X.sage } },
        alignment: { vertical: 'bottom' },
    });
    Object.assign(ws.getCell('A2'), {
        value: project.name,
        font: { name: FONT, size: 18, bold: true, color: { argb: X.primary } },
        alignment: { vertical: 'middle' },
    });
    if (logo) {
        const logoId = wb.addImage({ buffer: logo, extension: 'png' });
        // Logo artwork is 643×365; right-aligned with the table edge
        ws.addImage(logoId, { tl: { col: anchorFromRight(spec.columns, 98 + 4), row: 0.1 }, ext: { width: 98, height: 56 } });
    }

    // ── Details panel (rows 3–4): three label/value pairs per row ───────────
    const mid = 3 + Math.floor((n - 3) / 2);
    const regions: [number, number][] = [[1, 3], [4, mid], [mid + 1, n]];
    const details: [string, string | undefined][][] = [
        [['Client', project.client_name], ['Location', project.location], ['Date', dateStr]],
        [['Landscape Architect', project.landscape_architect], ['Architect', project.architect],
            ['Plants', String(groups.reduce((sum, [, pps]) => sum + pps.length, 0))]],
    ];
    details.forEach((pairs, i) => {
        const rowIdx = 3 + i;
        ws.getRow(rowIdx).height = 30;
        for (let c = 1; c <= n; c++) ws.getCell(rowIdx, c).fill = fill(X.mutedBg);
        pairs.forEach(([label, value], j) => {
            const [from, to] = regions[j];
            ws.mergeCells(rowIdx, from, rowIdx, to);
            Object.assign(ws.getCell(rowIdx, from), {
                value: {
                    richText: [
                        { text: `${label.toUpperCase()}\n`, font: { name: FONT, size: 7.5, bold: true, color: { argb: X.muted } } },
                        { text: value?.trim() || '—', font: { name: FONT, size: 10, color: { argb: X.ink } } },
                    ],
                },
                alignment: { vertical: 'middle', wrapText: true, indent: 1 },
                fill: fill(X.mutedBg),
            });
        });
    });
    ws.getRow(5).height = 8;

    // ── Table header ─────────────────────────────────────────────────────────
    const head = ws.getRow(HEADER_ROW);
    head.height = 26;
    spec.columns.forEach((c, i) => {
        Object.assign(head.getCell(i + 1), {
            value: c.header,
            font: { name: FONT, size: 9, bold: true, color: { argb: X.white } },
            fill: fill(X.primary),
            alignment: { vertical: 'middle', horizontal: c.align, wrapText: true },
            border: { bottom: { style: 'medium', color: { argb: X.primary } } },
        });
    });

    // ── Category groups + plant rows ─────────────────────────────────────────
    let rowIdx = HEADER_ROW + 1;
    let serial = 0;
    const dataRows: number[] = [];
    for (const [category, pps] of groups) {
        ws.mergeCells(rowIdx, 1, rowIdx, n);
        Object.assign(ws.getCell(rowIdx, 1), {
            value: `${category.toUpperCase()}   ·   ${pps.length}`,
            font: { name: FONT, size: 9, bold: true, color: { argb: X.accent } },
            fill: fill(X.tint),
            alignment: { vertical: 'middle', indent: 1 },
            border: { left: { style: 'thick', color: { argb: X.accent } } },
        });
        ws.getRow(rowIdx).height = 20;
        rowIdx += 1;

        for (let i = 0; i < pps.length; i++) {
            const pp = pps[i];
            const p = pp.plant!;
            serial += 1;
            const row = ws.getRow(rowIdx);
            row.height = 44;
            const values = spec.rowValues(pp, rowIdx);
            values[0] = serial;
            spec.columns.forEach((c, ci) => {
                const cell = row.getCell(ci + 1);
                cell.value = values[ci] ?? null;
                const isName = c.header === 'Common Name';
                const isSci = c.header === 'Scientific Name';
                cell.font = {
                    name: FONT,
                    size: 10,
                    bold: isName || c.header === 'Qty' || c.header === 'Amount',
                    italic: isSci,
                    color: { argb: isName || c.header === 'Amount' ? X.primary : isSci || ci === 0 ? X.muted : X.ink },
                };
                cell.alignment = { vertical: 'middle', horizontal: c.align, wrapText: c.align === 'left' };
                if (c.numFmt) cell.numFmt = c.numFmt;
                cell.fill = fill(i % 2 === 0 ? X.white : X.rowAlt);
                cell.border = { bottom: thin() };
            });

            const thumb = thumbs.get(p.id);
            if (thumb) {
                const imageId = wb.addImage({ base64: thumb, extension: 'jpeg' });
                ws.addImage(imageId, { tl: { col: 1.18, row: rowIdx - 1 + 0.12 }, ext: { width: 46, height: 46 }, editAs: 'oneCell' });
            }
            dataRows.push(rowIdx);
            rowIdx += 1;
        }
    }

    if (dataRows.length > 0) {
        spec.addTotals(ws, rowIdx + 1, dataRows);
    } else {
        ws.mergeCells(rowIdx, 1, rowIdx, n);
        Object.assign(ws.getCell(rowIdx, 1), {
            value: 'No plants added to this project.',
            font: { name: FONT, size: 10, italic: true, color: { argb: X.muted } },
            alignment: { horizontal: 'center', vertical: 'middle' },
        });
        ws.getRow(rowIdx).height = 28;
    }

    ws.pageSetup.printArea = `A1:${last}${Math.max(rowIdx + 3, HEADER_ROW + 1)}`;
    return wb;
}

/** A labelled total line: label across the first columns, formula in `valueCol`. */
function totalLine(
    ws: ExcelJS.Worksheet,
    rowIdx: number,
    n: number,
    label: string,
    valueCol: number,
    formula: string,
    result: number,
    numFmt: string,
    strong: boolean,
) {
    const row = ws.getRow(rowIdx);
    row.height = strong ? 26 : 22;
    ws.mergeCells(rowIdx, 1, rowIdx, valueCol - 1);
    for (let c = 1; c <= n; c++) {
        const cell = row.getCell(c);
        cell.fill = fill(strong ? X.primary : X.mutedBg);
        cell.border = strong ? {} : { top: thin(X.primary) };
    }
    Object.assign(row.getCell(1), {
        value: label,
        font: { name: FONT, size: strong ? 11 : 10, bold: true, color: { argb: strong ? X.white : X.primary } },
        alignment: { horizontal: 'right', vertical: 'middle', indent: 1 },
    });
    Object.assign(row.getCell(valueCol), {
        value: { formula, result },
        numFmt,
        font: { name: FONT, size: strong ? 12 : 10, bold: true, color: { argb: strong ? X.white : X.primary } },
        alignment: { horizontal: 'right', vertical: 'middle' },
    });
}

const sumOf = (col: string, rows: number[]) => `SUM(${col}${rows[0]}:${col}${rows[rows.length - 1]})`;

async function download(wb: ExcelJS.Workbook, filename: string) {
    const buffer = await wb.xlsx.writeBuffer();
    downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        filename,
    );
}

// ─── Bill of Quantities ───────────────────────────────────────────────────────
export async function exportProjectBoqExcel(project: Project, dateStr: string): Promise<void> {
    const columns: Column[] = [
        { header: '#', width: 5, align: 'center' },
        { header: 'Image', width: 10, align: 'center' },
        { header: 'Common Name', width: 24, align: 'left' },
        { header: 'Scientific Name', width: 26, align: 'left' },
        { header: 'Qty', width: 9, align: 'right', numFmt: QTY_FMT },
        { header: 'Unit', width: 9, align: 'center' },
        { header: 'Height / Size (ft)', width: 14, align: 'center' },
        { header: 'Notes', width: 30, align: 'left' },
    ];
    const wb = await buildWorkbook(project, dateStr, {
        title: 'BILL OF QUANTITIES',
        sheetName: 'BOQ',
        columns,
        footerLabel: `Bill of Quantities — ${project.name}`,
        rowValues: (pp) => [
            null,
            null,
            pp.plant?.common_name ?? '',
            pp.plant?.scientific_name || pp.plant?.taxon?.name || '—',
            pp.quantity ?? null,
            pp.unit || '—',
            pp.optimum_height_size || '—',
            pp.notes || '',
        ],
        addTotals: (ws, rowIdx, dataRows) => {
            const totalQty = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0), 0);
            totalLine(ws, rowIdx, columns.length, `Total quantity  (${dataRows.length} items)`, 5, sumOf('E', dataRows), totalQty, QTY_FMT, false);
        },
    });
    await download(wb, `${project.name}_BOQ.xlsx`);
}

// ─── Quotation ────────────────────────────────────────────────────────────────
export async function exportProjectQuotationExcel(project: Project, dateStr: string): Promise<void> {
    const columns: Column[] = [
        { header: '#', width: 5, align: 'center' },
        { header: 'Image', width: 10, align: 'center' },
        { header: 'Common Name', width: 24, align: 'left' },
        { header: 'Scientific Name', width: 24, align: 'left' },
        { header: 'Qty', width: 9, align: 'right', numFmt: QTY_FMT },
        { header: 'Unit', width: 9, align: 'center' },
        { header: 'Height / Size (ft)', width: 13, align: 'center' },
        { header: 'Rate', width: 12, align: 'right', numFmt: MONEY_FMT },
        { header: 'Amount', width: 15, align: 'right', numFmt: MONEY_FMT },
    ];
    const wb = await buildWorkbook(project, dateStr, {
        title: 'LANDSCAPE QUOTATION',
        sheetName: 'Quotation',
        columns,
        footerLabel: `Quotation — ${project.name}`,
        rowValues: (pp, rowIdx) => {
            const hasQty = pp.quantity !== undefined && pp.quantity !== null;
            const hasRate = pp.rate !== undefined && pp.rate !== null;
            return [
                null,
                null,
                pp.plant?.common_name ?? '',
                pp.plant?.scientific_name || pp.plant?.taxon?.name || '—',
                pp.quantity ?? null,
                pp.unit || '—',
                pp.optimum_height_size || '—',
                pp.rate ?? null,
                // Live formula so edits to Qty/Rate in Excel recalculate
                hasQty && hasRate
                    ? { formula: `E${rowIdx}*H${rowIdx}`, result: pp.quantity! * pp.rate! }
                    : { formula: `IF(AND(ISNUMBER(E${rowIdx}),ISNUMBER(H${rowIdx})),E${rowIdx}*H${rowIdx},"")`, result: '' },
            ];
        },
        addTotals: (ws, rowIdx, dataRows) => {
            const totalQty = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0), 0);
            const totalAmount = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0) * (pp.rate || 0), 0);
            totalLine(ws, rowIdx, columns.length, `Total quantity  (${dataRows.length} items)`, 5, sumOf('E', dataRows), totalQty, QTY_FMT, false);
            totalLine(ws, rowIdx + 1, columns.length, 'GRAND TOTAL', 9, sumOf('I', dataRows), totalAmount, MONEY_FMT, true);
        },
    });
    await download(wb, `${project.name}_Quotation.xlsx`);
}
