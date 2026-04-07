/**
 * ProjectPdfDocument.tsx
 *
 * Generates a real vector PDF using @react-pdf/renderer.
 * - Text is selectable / copyable
 * - File size is dramatically smaller than the html2canvas bitmap approach
 * - Layout matches the original design
 */

import {
    Document,
    Page,
    View,
    Text,
    Image,
    Link,
    StyleSheet,
    pdf,
    Svg,
    Path,
    Circle,
} from '@react-pdf/renderer';
import type { Project } from '../../types/project';
import type { TaxonTree } from '../../types/taxon';

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
    bg: '#fbfaf8',
    dark: '#1a1a1a',
    primary: '#2d5a27',
    sage: '#5a7a4f',
    mutedBg: '#f0ede8',
    mutedFg: '#666666',
    border: '#e5e1d8',
    white: '#ffffff',
    rowAlt: '#f6f4f1',
    redBg: '#fff5f5',
    redBorder: '#fed7d7',
    redTitle: '#c53030',
    redBody: '#742a2a',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanVal(val: string | null | undefined): string {
    if (!val) return '—';
    const v = String(val);
    return v.includes('.') ? v.split('.').pop()!.replace(/_/g, ' ') : v;
}

function cleaningPlace(val: unknown): boolean {
    if (!val) return false;
    const s = String(val);
    return s !== '' && s !== 'null' && s !== 'undefined';
}

function getTaxPath(nodes: TaxonTree[], id: string, path: TaxonTree[] = []): TaxonTree[] | null {
    for (const n of nodes) {
        const p = [...path, n];
        if (n.id === id) return p;
        if (n.children?.length) {
            const f = getTaxPath(n.children, id, p);
            if (f) return f;
        }
    }
    return null;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
    Water: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill={C.primary}>
            <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </Svg>
    ),
    Sun: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round">
            <Circle cx="12" cy="12" r="4" fill={C.primary} stroke="none" />
            <Path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </Svg>
    ),
    Soil: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 2v12M7 14h10M12 14c-3.5 0-5 2.5-5 5h10c0-2.5-1.5-5-5-5z" />
        </Svg>
    ),
    Tool: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M16 3L8 11M8 3l8 11M3 13h5v5M16 11h5v5" />
            <Circle cx="8" cy="16" r="2" />
            <Circle cx="16" cy="16" r="2" />
        </Svg>
    ),
    Care: () => (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </Svg>
    ),
    Desc: () => (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill={C.primary}>
            <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Path d="M14 2v6h6" stroke="#fff" strokeWidth="2" fill="none" />
        </Svg>
    ),
    Bug: () => (
        <Svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.redTitle} strokeWidth="2" strokeLinecap="round">
            <Path d="M8 2v4M16 2v4M3.5 7h17M4.5 12h15M6.5 17h11M12 6c-3.33 0-6 2.67-6 6v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7c0-3.33-2.67-6-6-6z" />
        </Svg>
    ),
    Lin: () => (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill={C.primary}>
            <Path d="M12 19l7-7 3 3-7 7-3-3z" />
            <Path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" stroke="#fff" strokeWidth="1" />
        </Svg>
    )
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        backgroundColor: C.bg,
        paddingHorizontal: 40,
        paddingVertical: 40,
        fontFamily: 'Helvetica',
        color: C.dark,
    },
    coverTitle: { fontSize: 32, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 8, letterSpacing: -0.8 },
    coverMeta: { flexDirection: 'row', gap: 24, marginBottom: 6 },
    coverMetaText: { fontSize: 11, color: C.mutedFg },
    coverMetaBold: { fontFamily: 'Helvetica-Bold', color: C.dark, marginRight: 4 },
    coverDesc: { fontSize: 11, color: C.mutedFg, lineHeight: 1.6, marginTop: 4, maxWidth: '85%' },
    divider: { borderBottomWidth: 1.5, borderBottomColor: C.primary, marginVertical: 20 },
    sectionTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.primary, marginBottom: 12, letterSpacing: -0.4 },
    tableHead: { flexDirection: 'row', backgroundColor: C.mutedBg, borderBottomWidth: 1.5, borderBottomColor: C.primary, alignItems: 'center' },
    th: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.8, paddingVertical: 8, paddingHorizontal: 8 },
    catRow: { paddingVertical: 10, paddingBottom: 4, borderLeftWidth: 4, borderLeftColor: C.primary, paddingLeft: 10, marginTop: 12 },
    catLabel: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.primary, textTransform: 'uppercase', letterSpacing: 1.2 },
    tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: C.border },
    td: { fontSize: 11, color: C.dark, paddingVertical: 8, paddingHorizontal: 8 },
    tdMuted: { fontSize: 10.5, color: C.mutedFg, paddingVertical: 8, paddingHorizontal: 8 },
    pill: { backgroundColor: C.mutedBg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 0.5, borderColor: C.border, alignSelf: 'flex-start' },
    pillText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.mutedFg, textTransform: 'uppercase', letterSpacing: 0.6 },
    plantPage: {
        backgroundColor: C.bg,
        paddingHorizontal: 40,
        paddingVertical: 40,
        fontFamily: 'Helvetica',
        color: C.dark,
        flex: 1,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 20 },
    headerLeft: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
    iconImg: { width: 64, height: 64, borderRadius: 12, objectFit: 'cover', borderWidth: 1, borderColor: C.border },
    plantName: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: C.dark, letterSpacing: -0.8, lineHeight: 1.1 },
    sciName: { fontSize: 14, fontFamily: 'Helvetica-Oblique', color: C.mutedFg, marginTop: 4 },
    pillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
    heroImg: { width: 220, height: 160, borderRadius: 12, objectFit: 'cover', borderWidth: 1, borderColor: C.border },
    dividerThin: { borderBottomWidth: 0.5, borderBottomColor: C.border, marginVertical: 15 },
    bodyGrid: { flex: 1, flexDirection: 'row', gap: 20 },
    mainCol: { flex: 7, flexDirection: 'column', gap: 15 },
    sideCol: { flex: 5, flexDirection: 'column', gap: 15 },
    card: { backgroundColor: C.white, borderWidth: 0.5, borderColor: C.border, borderRadius: 12, padding: 16 },
    cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.border },
    cardTitleText: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2 },
    bodyText: { fontSize: 11, color: C.dark, lineHeight: 1.6 },
    careGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    careItem: { backgroundColor: C.mutedBg, borderRadius: 8, padding: 10, width: '47%', minHeight: 48 },
    careKey: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: C.primary, marginBottom: 4, lineHeight: 1.2 },
    careVal: { fontSize: 10.5, color: C.dark, lineHeight: 1.5 },
    redCard: { backgroundColor: C.redBg, borderWidth: 0.5, borderColor: C.redBorder, borderRadius: 12, padding: 16 },
    redTitle: { color: C.redTitle, fontSize: 12, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
    redBody: { fontSize: 11, color: C.redBody, lineHeight: 1.6 },
    taxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.border },
    taxRank: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: C.mutedFg },
    taxName: { fontSize: 11, fontFamily: 'Helvetica', color: C.dark },
});

// ─── COVER PAGE ───────────────────────────────────────────────────────────────
interface CoverProps {
    project: Project;
    imgCache: Record<string, string>;
}

function CoverPage({ project, imgCache }: CoverProps) {
    const groups = new Map<string, Project['plants']>();
    for (const pp of project.plants) {
        const cat = cleanVal(pp.plant?.category ?? 'Other');
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(pp);
    }
    let serial = 0;
    const COL = { num: '6%', name: '28%', sci: '24%', place: '16%', notes: '26%' };

    return (
        <Page size="A4" style={s.page} wrap>
            <Text style={s.coverTitle}>{project.name}</Text>
            <View style={s.coverMeta}>
                {project.client_name && (
                    <Text style={s.coverMetaText}>
                        <Text style={s.coverMetaBold}>Client: </Text>{project.client_name}
                    </Text>
                )}
                {project.location && (
                    <Text style={s.coverMetaText}>
                        <Text style={s.coverMetaBold}>Location: </Text>{project.location}
                    </Text>
                )}
            </View>
            {project.description && (
                <Text style={s.coverDesc}>{project.description}</Text>
            )}
            <View style={s.divider} />
            <Text style={s.sectionTitle}>Project Inventory</Text>

            <View style={s.tableHead}>
                <Text style={[s.th, { width: COL.num, textAlign: 'center' }]}>#</Text>
                <Text style={[s.th, { width: COL.name }]}>Plant</Text>
                <Text style={[s.th, { width: COL.sci }]}>Scientific Name</Text>
                <Text style={[s.th, { width: COL.place }]}>Placement</Text>
                <Text style={[s.th, { width: COL.notes }]}>Notes</Text>
            </View>

            {Array.from(groups.entries()).map(([cat, pps]) => (
                <View key={cat}>
                    <View style={{ paddingVertical: 6, paddingBottom: 2 }}>
                        <View style={s.catRow}>
                            <Text style={s.catLabel}>{cat}</Text>
                        </View>
                    </View>

                    {pps.map((pp, rowIdx) => {
                        const p = pp.plant;
                        if (!p) return null;
                        serial += 1;
                        const rowBg = rowIdx % 2 === 0 ? C.bg : C.rowAlt;
                        const iconSrc = imgCache[p.id];
                        const placement = cleanVal(p.planting_place);

                        return (
                            <View key={pp.plant_id} style={[s.tableRow, { backgroundColor: rowBg, minHeight: 40 }]}>
                                <Text style={[s.tdMuted, { width: COL.num, textAlign: 'center', fontSize: 9.5, color: C.dark }]}>{serial}</Text>
                                <Link
                                    src={`#plant-${p.id}`}
                                    style={{
                                        width: COL.name,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingVertical: 5,
                                        paddingHorizontal: 6,
                                        textDecoration: 'none'
                                    }}
                                >
                                    {iconSrc && (
                                        <Image src={iconSrc} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                                    )}
                                    <Text style={{ fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.primary, flex: 1 }}>
                                        {p.common_name}
                                    </Text>
                                </Link>
                                <Text style={[s.tdMuted, { width: COL.sci, fontSize: 9.5 }]}>
                                    {p.scientific_name || p.taxon?.name || '—'}
                                </Text>
                                <View style={{ width: COL.place, paddingVertical: 5, paddingHorizontal: 6 }}>
                                    {cleaningPlace(p.planting_place) && (
                                        <View style={s.pill}>
                                            <Text style={s.pillText}>
                                                {placement === 'INDOOR & OUTDOOR' ? 'Both' : placement}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[s.tdMuted, { width: COL.notes, fontSize: 9.5 }]}>{pp.notes || '—'}</Text>
                            </View>
                        );
                    })}
                </View>
            ))}
        </Page>
    );
}

// ─── PLANT DETAIL PAGE ────────────────────────────────────────────────────────
interface PlantPageProps {
    pp: Project['plants'][number];
    taxTree: TaxonTree[] | null | undefined;
    imgCache: Record<string, string>;
}

function PlantDetailPage({ pp, taxTree, imgCache }: PlantPageProps) {
    const p = pp.plant;
    if (!p) return null;

    const taxPath = taxTree && p.taxon?.id ? getTaxPath(taxTree, p.taxon.id) : null;
    const heroSrc = imgCache[`hero_${p.id}`];
    const iconSrc = imgCache[`icon_${p.id}`];
    const placement = cleanVal(p.planting_place);
    const careEntries = Object.entries(p.care_data || {}).filter(([, v]) => v);

    return (
        <Page size="A4" style={s.plantPage}>
            <View style={s.header} id={`plant-${p.id}`}>
                <View style={s.headerLeft}>
                    <View style={s.nameRow}>
                        {iconSrc && <Image src={iconSrc} style={s.iconImg} />}
                        <View style={{ flex: 1 }}>
                            <Text style={s.plantName}>{p.common_name}</Text>
                            <Text style={s.sciName}>
                                {p.scientific_name || p.taxon?.name || 'Scientific Name Unknown'}
                            </Text>
                        </View>
                    </View>
                    <View style={s.pillsRow}>
                        {p.category && (
                            <View style={s.pill}>
                                <Text style={s.pillText}>{cleanVal(p.category)}</Text>
                            </View>
                        )}
                        {cleaningPlace(p.planting_place) && (
                            <View style={s.pill}>
                                <Text style={s.pillText}>
                                    {placement === 'INDOOR & OUTDOOR' ? 'Both' : placement}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
                {heroSrc && <Image src={heroSrc} style={s.heroImg} />}
            </View>

            <View style={s.dividerThin} />

            <View style={s.bodyGrid}>
                <View style={s.mainCol}>
                    <View style={[s.card, { flex: 1 }]}>
                        <View style={s.cardTitle}>
                            <View style={{ paddingTop: 3 }}><I.Desc /></View>
                            <Text style={s.cardTitleText}>Description</Text>
                        </View>
                        <Text style={s.bodyText}>
                            {p.description || 'No description provided.'}
                        </Text>
                    </View>

                    {careEntries.length > 0 && (
                        <View style={s.card}>
                            <View style={s.cardTitle}>
                                <View style={{ paddingTop: 3 }}><I.Care /></View>
                                <Text style={s.cardTitleText}>Care Guide</Text>
                            </View>
                            <View style={s.careGrid}>
                                {careEntries.map(([key, value]) => {
                                    const k = key.toLowerCase();
                                    let Icon = I.Soil;
                                    if (k.includes('water')) Icon = I.Water;
                                    else if (k.includes('sun') || k.includes('light')) Icon = I.Sun;
                                    else if (k.includes('maintenance') || k.includes('pruning')) Icon = I.Tool;

                                    return (
                                        <View key={key} style={s.careItem}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                <View style={{ paddingTop: 1.5 }}>
                                                    <Icon />
                                                </View>
                                                <Text style={s.careKey}>{key.replace(/_/g, ' ')}</Text>
                                            </View>
                                            <Text style={s.careVal}>{String(value)}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                </View>

                <View style={s.sideCol}>
                    {p.common_diseases && (
                        <View style={s.redCard}>
                            <View style={[s.cardTitle, { borderBottomColor: C.redBorder }]}>
                                <View style={{ paddingTop: 3 }}><I.Bug /></View>
                                <Text style={[s.cardTitleText, s.redTitle]}>Diseases & Pests</Text>
                            </View>
                            <Text style={s.redBody}>{p.common_diseases}</Text>
                        </View>
                    )}

                    {taxPath && taxPath.length > 0 && (
                        <View style={[s.card, { flex: 1 }]}>
                            <View style={s.cardTitle}>
                                <View style={{ paddingTop: 3 }}><I.Lin /> </View>
                                <Text style={s.cardTitleText}>Taxonomy Lineage</Text>
                            </View>
                            {taxPath.map((t, i) => (
                                <View key={t.id} style={[s.taxRow, i === taxPath.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                                    <Text style={s.taxRank}>{t.rank}</Text>
                                    <Text style={s.taxName}>{t.name}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </View>
        </Page>
    );
}

// ─── ROOT PDF DOCUMENT ────────────────────────────────────────────────────────
interface PdfDocProps {
    project: Project;
    taxTree: TaxonTree[] | null | undefined;
    imgCache: Record<string, string>;
}

function ProjectPdfDoc({ project, taxTree, imgCache }: PdfDocProps) {
    return (
        <Document title={project.name} author="Landschaft" creator="Landschaft Plants Database">
            <CoverPage project={project} imgCache={imgCache} />
            {project.plants.map((pp) =>
                pp.plant ? (
                    <PlantDetailPage key={pp.plant_id} pp={pp} taxTree={taxTree} imgCache={imgCache} />
                ) : null
            )}
        </Document>
    );
}

// ─── Export utility ───────────────────────────────────────────────────────────
export async function exportProjectPdfNew(
    project: Project,
    taxTree: TaxonTree[] | null | undefined,
    imgCache: Record<string, string>,
    filename: string,
): Promise<void> {
    const doc = <ProjectPdfDoc project={project} taxTree={taxTree} imgCache={imgCache} />;
    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}
