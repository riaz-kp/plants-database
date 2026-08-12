/**
 * ProjectQuotationPdfDocument.tsx
 *
 * Generates a clean vector PDF of the Landscape Quotation using @react-pdf/renderer.
 */

import {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
    pdf,
    Svg,
    Path,
} from '@react-pdf/renderer';
import type { Project } from '../../types/project';

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
    bg: '#fbfaf8',
    dark: '#1a1a1a',
    primary: '#1B3B2B',
    sage: '#758C73',
    mutedBg: '#f0ede8',
    mutedFg: '#666666',
    border: '#e5e1d8',
    white: '#ffffff',
    rowAlt: '#f6f4f1',
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        backgroundColor: C.bg,
        paddingHorizontal: 25,
        paddingVertical: 35,
        fontFamily: 'Helvetica',
        color: C.dark,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottomWidth: 1.5,
        borderBottomColor: C.primary,
    },
    headerLeft: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: C.primary,
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    metaGrid: {
        flexDirection: 'column',
        gap: 4,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaBold: {
        fontFamily: 'Helvetica-Bold',
        color: C.dark,
    },
    logoContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Table
    tableHead: {
        flexDirection: 'row',
        backgroundColor: C.primary,
        borderBottomWidth: 1.5,
        borderBottomColor: C.primary,
        alignItems: 'center',
        minHeight: 24,
    },
    th: {
        fontSize: 7.5,
        fontFamily: 'Helvetica-Bold',
        color: C.white,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingVertical: 6,
        paddingHorizontal: 3,
    },
    catHeader: {
        backgroundColor: C.mutedBg,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        paddingVertical: 6,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    catHeaderText: {
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: C.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 0.5,
        borderBottomColor: C.border,
        minHeight: 36,
    },
    td: {
        fontSize: 8.5,
        color: C.dark,
        paddingVertical: 4,
        paddingHorizontal: 3,
    },
    tdMuted: {
        fontSize: 8,
        color: C.mutedFg,
        fontFamily: 'Helvetica-Oblique',
        paddingVertical: 4,
        paddingHorizontal: 3,
    },
    plantImg: {
        width: 30,
        height: 30,
        borderRadius: 5,
        objectFit: 'cover',
        borderWidth: 0.5,
        borderColor: C.border,
        marginVertical: 3,
        marginHorizontal: 3,
    },
    fallbackImg: {
        width: 30,
        height: 30,
        borderRadius: 5,
        backgroundColor: '#e5e7eb',
        borderWidth: 0.5,
        borderColor: C.border,
        marginVertical: 3,
        marginHorizontal: 3,
    },
    qtyTd: {
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        color: C.dark,
        paddingVertical: 4,
        paddingHorizontal: 3,
    },
    totalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.mutedBg,
        borderTopWidth: 1,
        borderTopColor: C.primary,
        borderBottomWidth: 2,
        borderBottomColor: C.primary,
        minHeight: 28,
        marginTop: 8,
    },
    totalTd: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: C.primary,
        paddingVertical: 6,
        paddingHorizontal: 3,
    }
});

// ─── Column widths percentages (total must be 100%) ──────────────────────────
const COL = {
    num: '5%',
    img: '10%',
    common: '20%',
    sci: '18%',
    qty: '8%',
    unit: '8%',
    height: '11%',
    rate: '10%',
    amount: '10%',
};

interface QuotationPdfProps {
    project: Project;
    imgCache: Record<string, string>;
    dateStr: string;
}

function ProjectQuotationPdfDoc({ project, imgCache, dateStr }: QuotationPdfProps) {
    const groups = new Map<string, Project['plants']>();
    for (const pp of project.plants) {
        if (!pp.plant) continue;
        const cat = pp.plant.category || 'Uncategorized';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(pp);
    }
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    let serialIdx = 0;

    const totalQty = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0), 0);
    const totalAmount = project.plants.reduce((sum, pp) => sum + ((pp.quantity || 0) * (pp.rate || 0)), 0);

    return (
        <Document title={`${project.name} - Landscape Quotation`} author="Landschaft" creator="Landschaft Plants Database">
            <Page size="A4" style={s.page} wrap>
                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <Text style={s.title}>LANDSCAPE QUOTATION</Text>
                        <View style={s.metaGrid}>
                            <View style={s.metaItem}>
                                <Svg width="10" height="10" viewBox="0 0 12 12" style={{ marginRight: 5 }}>
                                    <Path fill={C.mutedFg} d="M1 2.5A1.5 1.5 0 0 1 2.5 1h2.2a1.5 1.5 0 0 1 1.06.44l1.06 1.06H10.5A1.5 1.5 0 0 1 12 4v5.5A1.5 1.5 0 0 1 10.5 11h-8A1.5 1.5 0 0 1 1-9.5v-7ZM2.5 2a.5.5 0 0 0-.5.5V3h8v-.5a.5.5 0 0 0-.5-.5H6.56a.5.5 0 0 0-.35-.15L5.15 2H2.5ZM11 4H1v5.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V4Z" />
                                </Svg>
                                <Text style={{ fontSize: 9.5, color: C.dark }}>{project.name}</Text>
                            </View>
                            <View style={s.metaItem}>
                                <Svg width="10" height="10" viewBox="0 0 12 12" style={{ marginRight: 5 }}>
                                    <Path fill={C.mutedFg} d="M6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-4.5 5A4.5 4.5 0 0 1 6 6.5a4.5 4.5 0 0 1 4.5 4.5.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5Z" />
                                </Svg>
                                <Text style={{ fontSize: 9.5, color: C.dark }}>{project.client_name || '—'}</Text>
                            </View>
                            <View style={s.metaItem}>
                                <Svg width="10" height="10" viewBox="0 0 12 12" style={{ marginRight: 5 }}>
                                    <Path fill={C.mutedFg} d="M6 0a4 4 0 0 0-4 4c0 3 4 8 4 8s4-5 4-4a4 4 0 0 0-4-4Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
                                </Svg>
                                <Text style={{ fontSize: 9.5, color: C.dark }}>{project.location || '—'}</Text>
                            </View>
                            <View style={s.metaItem}>
                                <Svg width="10" height="10" viewBox="0 0 12 12" style={{ marginRight: 5 }}>
                                    <Path fill={C.mutedFg} d="M3.5 0a.5.5 0 0 1 .5.5V2h4V.5a.5.5 0 0 1 1 0V2h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5ZM1 5v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5H1Z" />
                                </Svg>
                                <Text style={{ fontSize: 9.5, color: C.dark }}>{dateStr}</Text>
                            </View>
                        </View>
                    </View>
                    
                    {/* Landschaft Logo */}
                    <View style={s.logoContainer}>
                        <Image src={window.location.origin + '/logo-color.png'} style={{ width: 110, height: 110, marginRight: -15, marginTop: -10, marginBottom: -10 }} />
                    </View>
                </View>

                {/* Table Headers */}
                <View style={s.tableHead} fixed>
                    <Text style={[s.th, { width: COL.num, textAlign: 'center' }]}>#</Text>
                    <Text style={[s.th, { width: COL.img, textAlign: 'center' }]}>Img</Text>
                    <Text style={[s.th, { width: COL.common }]}>Common Name</Text>
                    <Text style={[s.th, { width: COL.sci }]}>Scientific Name</Text>
                    <Text style={[s.th, { width: COL.qty, textAlign: 'center' }]}>Qty</Text>
                    <Text style={[s.th, { width: COL.unit, textAlign: 'center' }]}>Unit</Text>
                    <Text style={[s.th, { width: COL.height, textAlign: 'center' }]}>Height/Size (ft)</Text>
                    <Text style={[s.th, { width: COL.rate, textAlign: 'right' }]}>Rate</Text>
                    <Text style={[s.th, { width: COL.amount, textAlign: 'right' }]}>Amount</Text>
                </View>

                {/* Table Rows Grouped by Category */}
                {project.plants.length === 0 ? (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, color: C.mutedFg }}>No plants added to this project.</Text>
                    </View>
                ) : (
                    sortedGroups.map(([category, pps]) => (
                        <View key={category} wrap={false}>
                            {/* Group Header Row */}
                            <View style={s.catHeader}>
                                <Text style={s.catHeaderText}>{category} ({pps.length})</Text>
                            </View>

                            {pps.map((pp, rowIdx) => {
                                const p = pp.plant;
                                if (!p) return null;
                                serialIdx += 1;
                                const rowBg = rowIdx % 2 === 0 ? C.white : C.rowAlt;
                                const imgUrl = imgCache[p.id] || imgCache[`icon_${p.id}`] || p.icon_url;
                                const amt = (pp.quantity !== undefined && pp.quantity !== null && pp.rate !== undefined && pp.rate !== null)
                                    ? pp.quantity * pp.rate
                                    : null;

                                return (
                                    <View key={pp.plant_id} style={[s.tableRow, { backgroundColor: rowBg }]} wrap={false}>
                                        <Text style={[s.td, { width: COL.num, textAlign: 'center', fontSize: 8 }]}>
                                            {serialIdx}
                                        </Text>
                                        <View style={{ width: COL.img, alignItems: 'center', justifyContent: 'center' }}>
                                            {imgUrl ? (
                                                <Image src={imgUrl} style={s.plantImg} />
                                            ) : (
                                                <View style={s.fallbackImg} />
                                            )}
                                        </View>
                                        <Text style={[s.td, { width: COL.common, fontFamily: 'Helvetica-Bold', color: C.primary }]}>
                                            {p.common_name}
                                        </Text>
                                        <Text style={[s.tdMuted, { width: COL.sci }]}>
                                            {p.scientific_name || p.taxon?.name || '—'}
                                        </Text>
                                        <Text style={[s.qtyTd, { width: COL.qty, textAlign: 'center' }]}>
                                            {pp.quantity !== undefined && pp.quantity !== null ? pp.quantity : '—'}
                                        </Text>
                                        <Text style={[s.td, { width: COL.unit, textAlign: 'center', color: C.mutedFg }]}>
                                            {pp.unit || '—'}
                                        </Text>
                                        <Text style={[s.td, { width: COL.height, textAlign: 'center' }]}>
                                            {pp.optimum_height_size || '—'}
                                        </Text>
                                        <Text style={[s.td, { width: COL.rate, textAlign: 'right' }]}>
                                            {pp.rate !== undefined && pp.rate !== null ? pp.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                        </Text>
                                        <Text style={[s.td, { width: COL.amount, fontFamily: 'Helvetica-Bold', color: C.primary, textAlign: 'right' }]}>
                                            {amt !== null ? amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    ))
                )}

                {/* Total Summary Row */}
                {project.plants.length > 0 && (
                    <View style={s.totalRow} wrap={false}>
                        <Text style={[s.totalTd, { width: '53%', textAlign: 'right', paddingRight: 10 }]}>
                            Total Summary:
                        </Text>
                        <Text style={[s.totalTd, { width: COL.qty, textAlign: 'center' }]}>
                            {totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </Text>
                        <Text style={[s.totalTd, { width: COL.unit }]}></Text>
                        <Text style={[s.totalTd, { width: COL.height }]}></Text>
                        <Text style={[s.totalTd, { width: COL.rate }]}></Text>
                        <Text style={[s.totalTd, { width: COL.amount, textAlign: 'right' }]}>
                            {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                    </View>
                )}
            </Page>
        </Document>
    );
}

// ─── Export utility ───────────────────────────────────────────────────────────
export async function exportProjectQuotationPdf(
    project: Project,
    imgCache: Record<string, string>,
    filename: string,
): Promise<void> {
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const doc = <ProjectQuotationPdfDoc project={project} imgCache={imgCache} dateStr={dateStr} />;
    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_Quotation.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}
