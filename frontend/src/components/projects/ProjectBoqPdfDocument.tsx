/**
 * ProjectBoqPdfDocument.tsx
 *
 * Generates a clean vector PDF of the Bill of Quantities (BOQ) using @react-pdf/renderer.
 */

import { Document, Page, View, Text, StyleSheet, pdf } from '@react-pdf/renderer';
import type { Project } from '../../types/project';
import {
    PDF, PAGE_STYLE, ts, DocHeader, DocFooter, GroupedRows, PlantThumb,
    scientificName, fmtQty,
} from './ProjectPdfShared';
import { groupByCategory, pdfDate, downloadBlob } from './projectExportUtils';

const s = StyleSheet.create({
    page: PAGE_STYLE,
    summary: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 18,
        marginTop: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderTopWidth: 1.5,
        borderTopColor: PDF.primary,
    },
    summaryLabel: { fontSize: 7.5, color: PDF.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
    summaryValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: PDF.primary },
});

// ─── Column widths (total 100%) ───────────────────────────────────────────────
const COL = {
    num: '5%',
    img: '9%',
    common: '26%',
    sci: '25%',
    qty: '10%',
    unit: '10%',
    height: '15%',
};

interface BoqPdfProps {
    project: Project;
    imgCache: Record<string, string>;
    dateStr: string;
}

function ProjectBoqPdfDoc({ project, imgCache, dateStr }: BoqPdfProps) {
    const groups = groupByCategory(project.plants);
    const totalQty = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0), 0);
    const itemCount = groups.reduce((sum, [, pps]) => sum + pps.length, 0);

    return (
        <Document title={`${project.name} - Bill of Quantities`} author="Landschaft" creator="Landschaft Plants Database">
            <Page size="A4" style={s.page} wrap>
                <DocHeader title="BILL OF QUANTITIES" project={project} dateStr={dateStr} />

                {/* Column headers repeat on every page */}
                <View style={ts.head} fixed>
                    <Text style={[ts.th, { width: COL.num, textAlign: 'center' }]}>#</Text>
                    <Text style={[ts.th, { width: COL.img, textAlign: 'center' }]}>Image</Text>
                    <Text style={[ts.th, { width: COL.common }]}>Common Name</Text>
                    <Text style={[ts.th, { width: COL.sci }]}>Scientific Name</Text>
                    <Text style={[ts.th, { width: COL.qty, textAlign: 'right' }]}>Qty</Text>
                    <Text style={[ts.th, { width: COL.unit, textAlign: 'center' }]}>Unit</Text>
                    <Text style={[ts.th, { width: COL.height, textAlign: 'center' }]}>Height / Size (ft)</Text>
                </View>

                {groups.length === 0 ? (
                    <Text style={ts.empty}>No plants added to this project.</Text>
                ) : (
                    <GroupedRows
                        groups={groups}
                        renderRow={(pp, rowIdx, serial) => {
                            const p = pp.plant!;
                            return (
                                <View
                                    style={[ts.row, { backgroundColor: rowIdx % 2 === 0 ? PDF.white : PDF.rowAlt }]}
                                    wrap={false}
                                >
                                    <Text style={[ts.td, { width: COL.num, textAlign: 'center', color: PDF.muted }]}>{serial}</Text>
                                    <View style={{ width: COL.img, alignItems: 'center', paddingVertical: 4 }}>
                                        <PlantThumb src={imgCache[p.id] || imgCache[`icon_${p.id}`] || p.icon_url} />
                                    </View>
                                    <Text style={[ts.name, { width: COL.common }]}>{p.common_name}</Text>
                                    <Text style={[ts.sci, { width: COL.sci }]}>{scientificName(pp)}</Text>
                                    <Text style={[ts.num, { width: COL.qty, fontFamily: 'Helvetica-Bold' }]}>{fmtQty(pp.quantity)}</Text>
                                    <Text style={[ts.td, { width: COL.unit, textAlign: 'center', color: PDF.muted }]}>{pp.unit || '—'}</Text>
                                    <Text style={[ts.td, { width: COL.height, textAlign: 'center' }]}>{pp.optimum_height_size || '—'}</Text>
                                </View>
                            );
                        }}
                        after={
                            <View style={s.summary}>
                                <View>
                                    <Text style={s.summaryLabel}>Items</Text>
                                    <Text style={s.summaryValue}>{itemCount}</Text>
                                </View>
                                <View>
                                    <Text style={s.summaryLabel}>Total quantity</Text>
                                    <Text style={s.summaryValue}>{fmtQty(totalQty)}</Text>
                                </View>
                            </View>
                        }
                    />
                )}

                <DocFooter label={`Bill of Quantities — ${project.name}`} />
            </Page>
        </Document>
    );
}

// ─── Export utility ───────────────────────────────────────────────────────────
export async function exportProjectBoqPdf(
    project: Project,
    imgCache: Record<string, string>,
    filename: string,
    dateStr: string = pdfDate(),
): Promise<void> {
    const doc = <ProjectBoqPdfDoc project={project} imgCache={imgCache} dateStr={dateStr} />;
    downloadBlob(await pdf(doc).toBlob(), `${filename}_BOQ.pdf`);
}
