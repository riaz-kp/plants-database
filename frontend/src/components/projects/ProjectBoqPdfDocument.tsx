/**
 * ProjectBoqPdfDocument.tsx
 *
 * Generates a clean vector PDF of the Bill of Quantities (BOQ) using @react-pdf/renderer.
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
        paddingHorizontal: 30,
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
        fontSize: 20,
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
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: C.white,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingVertical: 6,
        paddingHorizontal: 4,
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
        fontSize: 8.5,
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
        fontSize: 9.5,
        color: C.dark,
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    tdMuted: {
        fontSize: 9,
        color: C.mutedFg,
        fontFamily: 'Helvetica-Oblique',
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    plantImg: {
        width: 32,
        height: 32,
        borderRadius: 6,
        objectFit: 'cover',
        borderWidth: 0.5,
        borderColor: C.border,
        marginVertical: 4,
        marginHorizontal: 4,
    },
    fallbackImg: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#e5e7eb',
        borderWidth: 0.5,
        borderColor: C.border,
        marginVertical: 4,
        marginHorizontal: 4,
    },
    qtyTd: {
        fontSize: 9.5,
        fontFamily: 'Helvetica-Bold',
        color: C.dark,
        paddingVertical: 4,
        paddingHorizontal: 4,
    }
});

// ─── Column widths percentages (total must be 100%) ──────────────────────────
const COL = {
    num: '5%',
    img: '12%',
    common: '25%',
    sci: '24%',
    unit: '10%',
    qty: '10%',
    height: '14%',
};

interface BoqPdfProps {
    project: Project;
    imgCache: Record<string, string>;
    dateStr: string;
}

function ProjectBoqPdfDoc({ project, imgCache, dateStr }: BoqPdfProps) {
    const groups = new Map<string, Project['plants']>();
    for (const pp of project.plants) {
        if (!pp.plant) continue;
        const cat = pp.plant.category || 'Uncategorized';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(pp);
    }
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    let serialIdx = 0;

    return (
        <Document title={`${project.name} - Bill of Quantities`} author="Landschaft" creator="Landschaft Plants Database">
            <Page size="A4" style={s.page} wrap>
                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <Text style={s.title}>BILL OF QUANTITIES</Text>
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
                        <Image src={window.location.origin + '/logo-color.png'} style={{ width: 130, height: 130, marginRight: -20, marginTop: -15, marginBottom: -15 }} />
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

                                return (
                                    <View key={pp.plant_id} style={[s.tableRow, { backgroundColor: rowBg }]} wrap={false}>
                                        <Text style={[s.td, { width: COL.num, textAlign: 'center', fontSize: 9 }]}>
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
                                    </View>
                                );
                            })}
                        </View>
                    ))
                )}
            </Page>
        </Document>
    );
}

// ─── Export utility ───────────────────────────────────────────────────────────
export async function exportProjectBoqPdf(
    project: Project,
    imgCache: Record<string, string>,
    filename: string,
): Promise<void> {
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const doc = <ProjectBoqPdfDoc project={project} imgCache={imgCache} dateStr={dateStr} />;
    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_BOQ.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}
