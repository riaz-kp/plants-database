/**
 * ProjectPdfDocument.tsx
 *
 * Generates a real vector PDF using @react-pdf/renderer.
 * - Text is selectable / copyable
 * - File size is dramatically smaller than the html2canvas bitmap approach
 * - Page 1: project details + inventory table; then one page per plant
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
import {
    PDF, PAGE_STYLE, ts, DocHeader, DocFooter, GroupedRows, PlantThumb,
    groupByCategory, scientificName, pdfDate, downloadBlob,
} from './ProjectPdfShared';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanVal(val: string | null | undefined): string {
    if (!val) return '—';
    const v = String(val);
    return v.includes('.') ? v.split('.').pop()!.replace(/_/g, ' ') : v;
}

function placementLabel(val: unknown): string | null {
    if (!val) return null;
    const s = String(val);
    if (s === '' || s === 'null' || s === 'undefined') return null;
    const placement = cleanVal(s);
    return placement.toUpperCase() === 'INDOOR & OUTDOOR' ? 'Indoor & Outdoor' : placement;
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
        <Svg width="11" height="11" viewBox="0 0 24 24" fill={PDF.accent}>
            <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </Svg>
    ),
    Sun: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={PDF.accent} strokeWidth="2.5" strokeLinecap="round">
            <Circle cx="12" cy="12" r="4" fill={PDF.accent} stroke="none" />
            <Path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </Svg>
    ),
    Soil: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={PDF.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 2v12M7 14h10M12 14c-3.5 0-5 2.5-5 5h10c0-2.5-1.5-5-5-5z" />
        </Svg>
    ),
    Tool: () => (
        <Svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={PDF.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <Path d="M16 3L8 11M8 3l8 11M3 13h5v5M16 11h5v5" />
            <Circle cx="8" cy="16" r="2" />
            <Circle cx="16" cy="16" r="2" />
        </Svg>
    ),
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: PAGE_STYLE,
    brief: { marginBottom: 14 },
    briefLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: PDF.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
    briefText: { fontSize: 9.5, color: PDF.ink, lineHeight: 1.55 },
    sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: PDF.primary, marginBottom: 8 },
    pill: { backgroundColor: PDF.mutedBg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2.5, alignSelf: 'flex-start' },
    pillText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: PDF.muted, textTransform: 'uppercase', letterSpacing: 0.5 },

    // Plant detail pages
    running: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 8,
        marginBottom: 18,
        borderBottomWidth: 0.5,
        borderBottomColor: PDF.border,
    },
    runningText: { fontFamily: 'Montserrat', fontSize: 7, letterSpacing: 1.6, color: PDF.sage },
    runningLogo: { width: 44, height: 25, objectFit: 'contain' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 18 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    iconImg: { width: 56, height: 56, borderRadius: 10, objectFit: 'cover' },
    plantName: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: PDF.primary, lineHeight: 1.1 },
    sciName: { fontSize: 12, fontFamily: 'Helvetica-Oblique', color: PDF.muted, marginTop: 4 },
    pillsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
    note: { fontSize: 9, color: PDF.ink, lineHeight: 1.5, backgroundColor: PDF.tint, borderRadius: 6, padding: 8 },
    heroImg: { width: 210, height: 150, borderRadius: 10, objectFit: 'cover' },
    bodyGrid: { flexDirection: 'row', gap: 14 },
    mainCol: { flex: 7, gap: 12 },
    sideCol: { flex: 5, gap: 12 },
    card: { backgroundColor: PDF.white, borderWidth: 0.5, borderColor: PDF.border, borderRadius: 8, padding: 14 },
    cardTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: PDF.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: PDF.border },
    bodyText: { fontSize: 9.5, color: PDF.ink, lineHeight: 1.6 },
    careGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    careItem: { backgroundColor: PDF.mutedBg, borderRadius: 6, padding: 8, flexBasis: '45%', flexGrow: 1, minHeight: 44 },
    careKey: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: PDF.accent },
    careVal: { fontSize: 8.5, color: PDF.ink, lineHeight: 1.45, marginTop: 3 },
    redCard: { backgroundColor: '#fdf4f3', borderWidth: 0.5, borderColor: '#f3d2cd', borderRadius: 8, padding: 14 },
    redTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#a33a2c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    redBody: { fontSize: 9, color: '#6e2a20', lineHeight: 1.55 },
    taxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: PDF.border },
    taxRank: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, color: PDF.muted },
    taxName: { fontSize: 9, color: PDF.ink },
});

// ─── Column widths (total 100%) ───────────────────────────────────────────────
const COL = { num: '5%', name: '30%', sci: '24%', place: '16%', notes: '25%' };

// ─── COVER PAGE ───────────────────────────────────────────────────────────────
interface CoverProps {
    project: Project;
    imgCache: Record<string, string>;
    dateStr: string;
}

function CoverPage({ project, imgCache, dateStr }: CoverProps) {
    const groups = groupByCategory(project.plants);

    return (
        <Page size="A4" style={s.page} wrap>
            <DocHeader title="PROJECT INVENTORY" project={project} dateStr={dateStr} />

            {project.description && (
                <View style={s.brief}>
                    <Text style={s.briefLabel}>Project brief</Text>
                    <Text style={s.briefText}>{project.description}</Text>
                </View>
            )}

            <Text style={s.sectionTitle}>
                Plant Inventory <Text style={{ fontFamily: 'Helvetica', fontSize: 9, color: PDF.muted }}>· {groups.length} categories</Text>
            </Text>

            <View style={ts.head} fixed>
                <Text style={[ts.th, { width: COL.num, textAlign: 'center' }]}>#</Text>
                <Text style={[ts.th, { width: COL.name }]}>Plant</Text>
                <Text style={[ts.th, { width: COL.sci }]}>Scientific Name</Text>
                <Text style={[ts.th, { width: COL.place }]}>Placement</Text>
                <Text style={[ts.th, { width: COL.notes }]}>Notes</Text>
            </View>

            {groups.length === 0 ? (
                <Text style={ts.empty}>No plants added to this project.</Text>
            ) : (
                <GroupedRows
                    groups={groups}
                    renderRow={(pp, rowIdx, serial) => {
                        const p = pp.plant!;
                        const placement = placementLabel(p.planting_place);
                        return (
                            <View
                                style={[ts.row, { backgroundColor: rowIdx % 2 === 0 ? PDF.white : PDF.rowAlt }]}
                                wrap={false}
                            >
                                <Text style={[ts.td, { width: COL.num, textAlign: 'center', color: PDF.muted }]}>{serial}</Text>
                                {/* Links to the plant's page further down */}
                                <Link
                                    src={`#plant-${p.id}`}
                                    style={{ width: COL.name, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 5, textDecoration: 'none' }}
                                >
                                    <PlantThumb src={imgCache[p.id]} size={26} />
                                    <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: PDF.primary, flex: 1 }}>{p.common_name}</Text>
                                </Link>
                                <Text style={[ts.sci, { width: COL.sci }]}>{scientificName(pp)}</Text>
                                <View style={{ width: COL.place, paddingHorizontal: 5 }}>
                                    {placement && (
                                        <View style={s.pill}>
                                            <Text style={s.pillText}>{placement}</Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[ts.td, { width: COL.notes, color: pp.notes ? PDF.ink : PDF.muted }]}>{pp.notes || '—'}</Text>
                            </View>
                        );
                    }}
                />
            )}

            <DocFooter label={`Project Inventory — ${project.name}`} />
        </Page>
    );
}

// ─── PLANT DETAIL PAGE ────────────────────────────────────────────────────────
interface PlantPageProps {
    project: Project;
    pp: Project['plants'][number];
    taxTree: TaxonTree[] | null | undefined;
    imgCache: Record<string, string>;
}

function PlantDetailPage({ project, pp, taxTree, imgCache }: PlantPageProps) {
    const p = pp.plant;
    if (!p) return null;

    const taxPath = taxTree && p.taxon?.id ? getTaxPath(taxTree, p.taxon.id) : null;
    const heroSrc = imgCache[`hero_${p.id}`];
    const iconSrc = imgCache[`icon_${p.id}`];
    const placement = placementLabel(p.planting_place);
    const careEntries = Object.entries(p.care_data || {}).filter(([, v]) => v);
    // Without diseases or taxonomy the main column takes the full width
    const hasSide = !!p.common_diseases || !!taxPath?.length;

    return (
        <Page size="A4" style={s.page}>
            {/* Running header */}
            <View style={s.running}>
                <Text style={s.runningText}>PROJECT INVENTORY  ·  {project.name.toUpperCase()}</Text>
                <Image src={`${window.location.origin}/logo-pdf.png`} style={s.runningLogo} />
            </View>

            <View style={s.header} id={`plant-${p.id}`}>
                <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                        {iconSrc && <Image src={iconSrc} style={s.iconImg} />}
                        <View style={{ flex: 1 }}>
                            <Text style={s.plantName}>{p.common_name}</Text>
                            <Text style={s.sciName}>{scientificName(pp) === '—' ? 'Scientific name unknown' : scientificName(pp)}</Text>
                        </View>
                    </View>
                    <View style={s.pillsRow}>
                        {p.category && (
                            <View style={s.pill}><Text style={s.pillText}>{cleanVal(p.category)}</Text></View>
                        )}
                        {placement && (
                            <View style={s.pill}><Text style={s.pillText}>{placement}</Text></View>
                        )}
                    </View>
                    {pp.notes && <Text style={s.note}>Project note: {pp.notes}</Text>}
                </View>
                {heroSrc && <Image src={heroSrc} style={s.heroImg} />}
            </View>

            <View style={s.bodyGrid}>
                <View style={s.mainCol}>
                    <View style={s.card}>
                        <Text style={s.cardTitle}>Description</Text>
                        <Text style={s.bodyText}>{p.description || 'No description provided.'}</Text>
                    </View>

                    {careEntries.length > 0 && (
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Care Guide</Text>
                            <View style={s.careGrid}>
                                {careEntries.map(([key, value]) => {
                                    const k = key.toLowerCase();
                                    let Icon = I.Soil;
                                    if (k.includes('water')) Icon = I.Water;
                                    else if (k.includes('sun') || k.includes('light')) Icon = I.Sun;
                                    else if (k.includes('maintenance') || k.includes('pruning')) Icon = I.Tool;

                                    return (
                                        <View key={key} style={s.careItem}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                <Icon />
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

                {hasSide && (
                <View style={s.sideCol}>
                    {p.common_diseases && (
                        <View style={s.redCard}>
                            <Text style={s.redTitle}>Diseases & Pests</Text>
                            <Text style={s.redBody}>{p.common_diseases}</Text>
                        </View>
                    )}

                    {taxPath && taxPath.length > 0 && (
                        <View style={s.card}>
                            <Text style={s.cardTitle}>Taxonomy Lineage</Text>
                            {taxPath.map((t, i) => (
                                <View key={t.id} style={[s.taxRow, i === taxPath.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                                    <Text style={s.taxRank}>{t.rank}</Text>
                                    <Text style={s.taxName}>{t.name}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
                )}
            </View>

            <DocFooter label={`Project Inventory — ${project.name}`} />
        </Page>
    );
}

// ─── ROOT PDF DOCUMENT ────────────────────────────────────────────────────────
interface PdfDocProps {
    project: Project;
    taxTree: TaxonTree[] | null | undefined;
    imgCache: Record<string, string>;
    dateStr: string;
}

function ProjectPdfDoc({ project, taxTree, imgCache, dateStr }: PdfDocProps) {
    // Detail pages follow the inventory order (by category)
    const ordered = groupByCategory(project.plants).flatMap(([, pps]) => pps);
    return (
        <Document title={project.name} author="Landschaft" creator="Landschaft Plants Database">
            <CoverPage project={project} imgCache={imgCache} dateStr={dateStr} />
            {ordered.map((pp) => (
                <PlantDetailPage key={pp.plant_id} project={project} pp={pp} taxTree={taxTree} imgCache={imgCache} />
            ))}
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
    const doc = <ProjectPdfDoc project={project} taxTree={taxTree} imgCache={imgCache} dateStr={pdfDate()} />;
    downloadBlob(await pdf(doc).toBlob(), `${filename}.pdf`);
}
