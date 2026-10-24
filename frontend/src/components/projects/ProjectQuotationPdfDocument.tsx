/**
 * ProjectQuotationPdfDocument.tsx
 *
 * Generates a clean vector PDF of the Landscape Quotation using @react-pdf/renderer.
 */

import { Document, Page, View, Text, StyleSheet, pdf } from '@react-pdf/renderer';
import type { Project } from '../../types/project';
import {
    PDF, PAGE_STYLE, ts, DocHeader, DocFooter, GroupedRows, PlantThumb,
    scientificName, fmtQty, fmtMoney,
} from './ProjectPdfShared';
import { groupByCategory, pdfDate, downloadBlob } from './projectExportUtils';

const s = StyleSheet.create({
    page: PAGE_STYLE,
    totals: {
        alignSelf: 'flex-end',
        width: 230,
        marginTop: 14,
        borderWidth: 0.5,
        borderColor: PDF.border,
        borderRadius: 6,
        overflow: 'hidden',
    },
    totalLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderBottomWidth: 0.5,
        borderBottomColor: PDF.border,
    },
    totalLabel: { fontSize: 8.5, color: PDF.muted },
    totalValue: { fontSize: 9, color: PDF.ink, fontFamily: 'Helvetica-Bold' },
    grandLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 10,
        backgroundColor: PDF.primary,
    },
    grandLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: PDF.white, textTransform: 'uppercase', letterSpacing: 0.8 },
    grandValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: PDF.white },
});

// ─── Column widths (total 100%) ───────────────────────────────────────────────
const COL = {
    num: '4%',
    img: '8%',
    common: '19%',
    sci: '18%',
    qty: '8%',
    unit: '8%',
    height: '11%',
    rate: '11%',
    amount: '13%',
};

interface QuotationPdfProps {
    project: Project;
    imgCache: Record<string, string>;
    dateStr: string;
}

function ProjectQuotationPdfDoc({ project, imgCache, dateStr }: QuotationPdfProps) {
    const groups = groupByCategory(project.plants);
    const totalQty = project.plants.reduce((sum, pp) => sum + (pp.quantity || 0), 0);
    const totalAmount = project.plants.reduce((sum, pp) => sum + ((pp.quantity || 0) * (pp.rate || 0)), 0);
    const itemCount = groups.reduce((sum, [, pps]) => sum + pps.length, 0);

    return (
        <Document title={`${project.name} - Landscape Quotation`} author="Landschaft" creator="Landschaft Plants Database">
            <Page size="A4" style={s.page} wrap>
                <DocHeader title="LANDSCAPE QUOTATION" project={project} dateStr={dateStr} />

                {/* Column headers repeat on every page */}
                <View style={ts.head} fixed>
                    <Text style={[ts.th, { width: COL.num, textAlign: 'center' }]}>#</Text>
                    <Text style={[ts.th, { width: COL.img, textAlign: 'center' }]}>Image</Text>
                    <Text style={[ts.th, { width: COL.common }]}>Common Name</Text>
                    <Text style={[ts.th, { width: COL.sci }]}>Scientific Name</Text>
                    <Text style={[ts.th, { width: COL.qty, textAlign: 'right' }]}>Qty</Text>
                    <Text style={[ts.th, { width: COL.unit, textAlign: 'center' }]}>Unit</Text>
                    <Text style={[ts.th, { width: COL.height, textAlign: 'center' }]}>Size (ft)</Text>
                    <Text style={[ts.th, { width: COL.rate, textAlign: 'right' }]}>Rate</Text>
                    <Text style={[ts.th, { width: COL.amount, textAlign: 'right' }]}>Amount</Text>
                </View>

                {groups.length === 0 ? (
                    <Text style={ts.empty}>No plants added to this project.</Text>
                ) : (
                    <GroupedRows
                        groups={groups}
                        renderRow={(pp, rowIdx, serial) => {
                            const p = pp.plant!;
                            const hasQty = pp.quantity !== undefined && pp.quantity !== null;
                            const hasRate = pp.rate !== undefined && pp.rate !== null;
                            return (
                                <View
                                    style={[ts.row, { backgroundColor: rowIdx % 2 === 0 ? PDF.white : PDF.rowAlt }]}
                                    wrap={false}
                                >
                                    <Text style={[ts.td, { width: COL.num, textAlign: 'center', color: PDF.muted }]}>{serial}</Text>
                                    <View style={{ width: COL.img, alignItems: 'center', paddingVertical: 4 }}>
                                        <PlantThumb src={imgCache[p.id] || imgCache[`icon_${p.id}`] || p.icon_url} size={28} />
                                    </View>
                                    <Text style={[ts.name, { width: COL.common }]}>{p.common_name}</Text>
                                    <Text style={[ts.sci, { width: COL.sci }]}>{scientificName(pp)}</Text>
                                    <Text style={[ts.num, { width: COL.qty, fontFamily: 'Helvetica-Bold' }]}>{fmtQty(pp.quantity)}</Text>
                                    <Text style={[ts.td, { width: COL.unit, textAlign: 'center', color: PDF.muted }]}>{pp.unit || '—'}</Text>
                                    <Text style={[ts.td, { width: COL.height, textAlign: 'center' }]}>{pp.optimum_height_size || '—'}</Text>
                                    <Text style={[ts.num, { width: COL.rate }]}>{hasRate ? fmtMoney(pp.rate!) : '—'}</Text>
                                    <Text style={[ts.num, { width: COL.amount, fontFamily: 'Helvetica-Bold', color: PDF.primary }]}>
                                        {hasQty && hasRate ? fmtMoney(pp.quantity! * pp.rate!) : '—'}
                                    </Text>
                                </View>
                            );
                        }}
                        after={
                            <View style={s.totals}>
                                <View style={s.totalLine}>
                                    <Text style={s.totalLabel}>Items</Text>
                                    <Text style={s.totalValue}>{itemCount}</Text>
                                </View>
                                <View style={s.totalLine}>
                                    <Text style={s.totalLabel}>Total quantity</Text>
                                    <Text style={s.totalValue}>{fmtQty(totalQty)}</Text>
                                </View>
                                <View style={s.grandLine}>
                                    <Text style={s.grandLabel}>Grand Total</Text>
                                    <Text style={s.grandValue}>{fmtMoney(totalAmount)}</Text>
                                </View>
                            </View>
                        }
                    />
                )}

                <DocFooter label={`Quotation — ${project.name}`} />
            </Page>
        </Document>
    );
}

// ─── Export utility ───────────────────────────────────────────────────────────
export async function exportProjectQuotationPdf(
    project: Project,
    imgCache: Record<string, string>,
    filename: string,
    dateStr: string = pdfDate(),
): Promise<void> {
    const doc = <ProjectQuotationPdfDoc project={project} imgCache={imgCache} dateStr={dateStr} />;
    downloadBlob(await pdf(doc).toBlob(), `${filename}_Quotation.pdf`);
}
