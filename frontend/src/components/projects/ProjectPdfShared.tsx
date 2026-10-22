/**
 * ProjectPdfShared.tsx
 *
 * Look & feel shared by every project PDF (inventory, BOQ, quotation):
 * palette, the document header with the project details and logo,
 * the page footer, and the plant table styles.
 */

import { Fragment, type ReactNode } from 'react';
import { View, Text, Image, Svg, Path, StyleSheet, Font } from '@react-pdf/renderer';
import type { Project } from '../../types/project';

Font.register({ family: 'Montserrat', src: `${window.location.origin}/Montserrat-Regular.ttf` });
// Keep words whole ("Bougainvillea", not "Bougain-villea")
Font.registerHyphenationCallback(word => [word]);

// ─── Brand palette ────────────────────────────────────────────────────────────
export const PDF = {
    ink: '#1c2a1a',
    primary: '#1B3B2B',
    accent: '#2d5a27',
    sage: '#6f8a6c',
    muted: '#6b726a',
    mutedBg: '#f4f2ed',
    tint: '#eef3ec',
    border: '#e2ddd3',
    rowAlt: '#fafaf7',
    white: '#ffffff',
};

export const PAGE_STYLE = {
    backgroundColor: PDF.white,
    paddingTop: 34,
    paddingBottom: 56,
    paddingHorizontal: 34,
    fontFamily: 'Helvetica',
    color: PDF.ink,
} as const;

// ─── Formatting helpers ───────────────────────────────────────────────────────
export const pdfDate = () =>
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtQty = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const scientificName = (pp: Project['plants'][number]) =>
    pp.plant?.scientific_name || pp.plant?.taxon?.name || '—';

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

/** Triggers a browser download of the rendered PDF. */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}

// ─── Document header ──────────────────────────────────────────────────────────
const hs = StyleSheet.create({
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
    kicker: { fontFamily: 'Montserrat', fontSize: 8.5, letterSpacing: 2.4, color: PDF.sage, marginBottom: 6 },
    project: { fontSize: 21, fontFamily: 'Helvetica-Bold', color: PDF.primary, lineHeight: 1.15 },
    logo: { width: 88, height: 50, objectFit: 'contain' },
    meta: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 14,
        paddingVertical: 4,
        paddingHorizontal: 12,
        backgroundColor: PDF.mutedBg,
        borderRadius: 6,
    },
    metaCell: { width: '33.33%', paddingVertical: 6, paddingRight: 10 },
    metaLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: PDF.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
    metaValue: { fontSize: 9.5, color: PDF.ink, lineHeight: 1.3 },
    rule: { height: 2, backgroundColor: PDF.primary, marginTop: 14, marginBottom: 16 },
});

interface DocHeaderProps {
    /** Document type, e.g. "BILL OF QUANTITIES". */
    title: string;
    project: Project;
    dateStr: string;
}

export function DocHeader({ title, project, dateStr }: DocHeaderProps) {
    const meta: [string, string | undefined][] = [
        ['Client', project.client_name],
        ['Location', project.location],
        ['Date', dateStr],
        ['Landscape Architect', project.landscape_architect],
        ['Architect', project.architect],
        ['Plants', String(project.plants.filter(pp => pp.plant).length)],
    ];
    return (
        <View>
            <View style={hs.top}>
                <View style={{ flex: 1 }}>
                    <Text style={hs.kicker}>{title}</Text>
                    <Text style={hs.project}>{project.name}</Text>
                </View>
                <Image src={`${window.location.origin}/logo-pdf.png`} style={hs.logo} />
            </View>
            <View style={hs.meta}>
                {meta.map(([label, value]) => (
                    <View key={label} style={hs.metaCell}>
                        <Text style={hs.metaLabel}>{label}</Text>
                        <Text style={hs.metaValue}>{value?.trim() || '—'}</Text>
                    </View>
                ))}
            </View>
            <View style={hs.rule} />
        </View>
    );
}

// ─── Page footer (every page) ─────────────────────────────────────────────────
const fs = StyleSheet.create({
    footer: {
        position: 'absolute',
        bottom: 22,
        left: 34,
        right: 34,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 7,
        borderTopWidth: 0.5,
        borderTopColor: PDF.border,
    },
    brand: { fontFamily: 'Montserrat', fontSize: 7, letterSpacing: 1.6, color: PDF.primary },
    text: { fontSize: 7.5, color: PDF.muted },
});

export function DocFooter({ label }: { label: string }) {
    return (
        <View style={fs.footer} fixed>
            <Text style={fs.text}>
                <Text style={fs.brand}>LANDSCHAFT</Text>
                {'   ·   '}{label}
            </Text>
            <Text style={fs.text} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
    );
}

// ─── Plant tables ─────────────────────────────────────────────────────────────
export const ts = StyleSheet.create({
    head: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: PDF.primary,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        minHeight: 24,
    },
    th: {
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        color: PDF.white,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        paddingVertical: 7,
        paddingHorizontal: 5,
    },
    catRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: PDF.tint,
        borderLeftWidth: 3,
        borderLeftColor: PDF.accent,
        paddingVertical: 5,
        paddingHorizontal: 8,
        marginTop: 6,
    },
    catText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: PDF.primary, textTransform: 'uppercase', letterSpacing: 1 },
    catCount: { fontSize: 7.5, color: PDF.sage, marginLeft: 6 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 0.5,
        borderBottomColor: PDF.border,
        minHeight: 38,
    },
    td: { fontSize: 8.5, color: PDF.ink, paddingVertical: 4, paddingHorizontal: 5, lineHeight: 1.3 },
    name: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: PDF.primary, paddingVertical: 4, paddingHorizontal: 5, lineHeight: 1.25 },
    sci: { fontSize: 8.5, fontFamily: 'Helvetica-Oblique', color: PDF.muted, paddingVertical: 4, paddingHorizontal: 5, lineHeight: 1.25 },
    num: { fontSize: 8.5, color: PDF.ink, paddingVertical: 4, paddingHorizontal: 5, textAlign: 'right' },
    img: { width: 30, height: 30, borderRadius: 5, objectFit: 'cover' },
    empty: { paddingVertical: 24, textAlign: 'center', fontSize: 10, color: PDF.muted },
});

/** Plant thumbnail, or a leaf placeholder when the plant has no image. */
export function PlantThumb({ src, size = 30 }: { src?: string | null; size?: number }) {
    if (src) return <Image src={src} style={[ts.img, { width: size, height: size }]} />;
    return (
        <View style={{ width: size, height: size, borderRadius: 5, backgroundColor: PDF.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24">
                <Path
                    d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6"
                    stroke={PDF.sage}
                    strokeWidth={1.8}
                    fill="none"
                />
            </Svg>
        </View>
    );
}

/** Category divider row: "SHRUB  4". */
export function CategoryRow({ name, count }: { name: string; count: number }) {
    return (
        <View style={ts.catRow}>
            <Text style={ts.catText}>{name}</Text>
            <Text style={ts.catCount}>{count}</Text>
        </View>
    );
}

interface GroupedRowsProps {
    groups: [string, Project['plants']][];
    /** One table row (should be `wrap={false}`); `serial` counts from 1 across all groups. */
    renderRow: (pp: Project['plants'][number], rowIdx: number, serial: number) => ReactNode;
    /** Rendered after the last row and kept on the same page as it (e.g. totals). */
    after?: ReactNode;
}

/**
 * Category-grouped table body that paginates cleanly: a category label always
 * moves to the next page together with its first plant, and `after` never
 * ends up alone on a page.
 */
export function GroupedRows({ groups, renderRow, after }: GroupedRowsProps) {
    let serial = 0;
    return (
        <>
            {groups.map(([category, pps], groupIdx) => pps.map((pp, rowIdx) => {
                serial += 1;
                const row = renderRow(pp, rowIdx, serial);
                const isFirst = rowIdx === 0;
                const isLast = groupIdx === groups.length - 1 && rowIdx === pps.length - 1;
                if (!isFirst && !(isLast && after)) return <Fragment key={pp.plant_id}>{row}</Fragment>;
                return (
                    <View key={pp.plant_id} wrap={false}>
                        {isFirst && <CategoryRow name={category} count={pps.length} />}
                        {row}
                        {isLast && after}
                    </View>
                );
            }))}
        </>
    );
}
