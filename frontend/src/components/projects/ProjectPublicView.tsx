/**
 * ProjectPublicView.tsx
 *
 * Standalone page accessible via /share/:token.
 * Shows full project details (matching PDF layout) without any app chrome.
 * URL expires after 2 days.
 */

import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { projectsApi } from '../../api/projects';
import { taxonomyApi } from '../../api/taxonomy';
import type { Project } from '../../types/project';
import type { Taxon } from '../../types/taxon';
import type { TaxonTree } from '../../types/taxon';
import { Leaf, MapPin, User, Calendar, AlertTriangle } from 'lucide-react';

/* ── helpers ── */
function cleanVal(val: string | null | undefined): string {
    if (!val) return '—';
    const v = String(val);
    return v.includes('.') ? v.split('.').pop()!.replace(/_/g, ' ') : v;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
}

function scrollToPlant(plantId: string) {
    const el = document.getElementById(`plant-${plantId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/* ── Taxonomy lineage builder ── */
function buildLineage(taxon: Taxon | undefined): { rank: string; name: string }[] {
    if (!taxon) return [];
    const path: { rank: string; name: string }[] = [];
    let cur: Taxon | undefined = taxon;
    while (cur) {
        path.unshift({ rank: cleanVal(cur.rank), name: cur.name });
        cur = cur.parent;
    }
    return path;
}

/* Also build from TaxonTree by walking the tree */
function getTaxonPath(nodes: TaxonTree[], id: string, path: TaxonTree[] = []): TaxonTree[] | null {
    for (const n of nodes) {
        const p = [...path, n];
        if (n.id === id) return p;
        if (n.children?.length) {
            const f = getTaxonPath(n.children, id, p);
            if (f) return f;
        }
    }
    return null;
}

/* ── Care icons as SVG ── */
function CareIcon({ careKey }: { careKey: string }) {
    const k = careKey.toLowerCase();
    const color = '#2d5a27';

    if (k.includes('water') || k.includes('irrigation')) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill={color}>
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
        );
    }
    if (k.includes('sun') || k.includes('light')) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" fill={color} stroke="none" />
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
        );
    }
    if (k.includes('soil') || k.includes('substrate') || k.includes('fertilizer') || k.includes('compost')) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v12M7 14h10M12 14c-3.5 0-5 2.5-5 5h10c0-2.5-1.5-5-5-5z" />
            </svg>
        );
    }
    if (k.includes('prune') || k.includes('trim') || k.includes('maintenance') || k.includes('cut')) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
                <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12l1.4 1.4" />
            </svg>
        );
    }
    if (k.includes('humid') || k.includes('mist') || k.includes('spray')) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                <path d="M8 14h8M9 17h6" strokeWidth="2" />
            </svg>
        );
    }
    if (k.includes('temp') || k.includes('heat') || k.includes('cold') || k.includes('frost')) {
        return (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 9V2M12 15v-2" />
                <path d="M8.5 17.5A3.5 3.5 0 1 0 15.5 17.5" />
                <circle cx="12" cy="17" r="3.5" fill={color} stroke="none" />
                <line x1="12" y1="9" x2="12" y2="15" />
            </svg>
        );
    }
    // default leaf
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill={color}>
            <path d="M17 8C8 10 5.9 16.17 3.82 22a2 2 0 0 0 2.8.92C8.4 21.6 11 19.2 13 16c1.8-2.8 2-6 2-8Z" />
            <path d="M7 14c-1.3 3-2.1 5.5-3 8" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

/* ── Taxonomy card ── */
function TaxonomyCard({ taxon, taxTree }: { taxon: Taxon | undefined; taxTree: TaxonTree[] | null | undefined }) {
    if (!taxon) return null;

    // Try tree-based lineage first (more complete), fall back to parent-chain
    let lineage: { rank: string; name: string }[] = [];
    if (taxTree && taxon.id) {
        const path = getTaxonPath(taxTree, taxon.id);
        if (path) lineage = path.map(t => ({ rank: cleanVal(t.rank), name: t.name }));
    }
    if (!lineage.length) {
        lineage = buildLineage(taxon);
    }
    if (!lineage.length) return null;

    return (
        <div className="pv-card">
            <h3 className="pv-card-title">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#2d5a27" style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}>
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" fill="none" stroke="#fff" strokeWidth="1" />
                </svg>
                Taxonomy Lineage
            </h3>
            <div className="pv-tax-list">
                {lineage.map((item, i) => (
                    <div key={i} className={`pv-tax-row ${i === lineage.length - 1 ? 'pv-tax-last' : ''}`}>
                        <span className="pv-tax-rank">{item.rank}</span>
                        <span className="pv-tax-name">{item.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── GroupedInventory ── */
function GroupedInventory({ project }: { project: Project }) {
    const groups = new Map<string, Project['plants']>();
    for (const pp of project.plants) {
        const cat = cleanVal(pp.plant?.category ?? 'Other');
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(pp);
    }
    let serial = 0;

    return (
        <div className="pv-inventory">
            <table className="pv-table">
                <thead>
                    <tr>
                        <th style={{ width: '5%' }}>#</th>
                        <th style={{ width: '28%' }}>Plant</th>
                        <th style={{ width: '27%' }}>Scientific Name</th>
                        <th style={{ width: '15%' }}>Placement</th>
                        <th style={{ width: '25%' }}>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from(groups.entries()).map(([cat, pps]) => (
                        <>
                            <tr key={`cat-${cat}`} className="pv-cat-row">
                                <td colSpan={5}>{cat}</td>
                            </tr>
                            {pps.map((pp) => {
                                const p = pp.plant;
                                if (!p) return null;
                                serial += 1;
                                const placement = cleanVal(p.planting_place);
                                return (
                                    <tr key={pp.plant_id} className="pv-data-row">
                                        <td className="pv-num">{serial}</td>
                                        <td>
                                            <div className="pv-plant-cell">
                                                {p.icon_url && (
                                                    <img src={p.icon_url} alt="" className="pv-icon" />
                                                )}
                                                <button
                                                    className="pv-plant-link"
                                                    onClick={() => scrollToPlant(p.id)}
                                                    title={`Jump to ${p.common_name} details`}
                                                >
                                                    {p.common_name}
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 4, opacity: 0.5 }}>
                                                        <path d="M12 5v14M5 12l7 7 7-7" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                        <td className="pv-sci">{p.scientific_name || p.taxon?.name || '—'}</td>
                                        <td>
                                            {p.planting_place && (
                                                <span className="pv-pill">
                                                    {placement === 'INDOOR & OUTDOOR' ? 'Both' : placement}
                                                </span>
                                            )}
                                        </td>
                                        <td className="pv-notes">{pp.notes || '—'}</td>
                                    </tr>
                                );
                            })}
                        </>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ── PlantCard ── */
function PlantCard({
    pp, index, taxTree,
}: {
    pp: Project['plants'][number];
    index: number;
    taxTree: TaxonTree[] | null | undefined;
}) {
    const p = pp.plant;
    if (!p) return null;
    const placement = cleanVal(p.planting_place);
    const careEntries = Object.entries(p.care_data || {}).filter(([, v]) => v);

    return (
        <div className="pv-plant-card" id={`plant-${p.id}`}>
            {/* header */}
            <div className="pv-pc-header">
                <div className="pv-pc-header-left">
                    <div className="pv-pc-name-row">
                        {p.icon_url && <img src={p.icon_url} alt="" className="pv-pc-icon" />}
                        <div>
                            <p className="pv-pc-index">#{index}</p>
                            <h2 className="pv-pc-name">{p.common_name}</h2>
                            <p className="pv-pc-sci">{p.scientific_name || p.taxon?.name || 'Scientific Name Unknown'}</p>
                        </div>
                    </div>
                    <div className="pv-pills-row">
                        {p.category && <span className="pv-pill">{cleanVal(p.category)}</span>}
                        {p.planting_place && (
                            <span className="pv-pill">
                                {placement === 'INDOOR & OUTDOOR' ? 'Both' : placement}
                            </span>
                        )}
                    </div>
                </div>
                {p.image_url && (
                    <img src={p.image_url} alt={p.common_name} className="pv-pc-hero" />
                )}
            </div>

            <hr className="pv-divider" />

            {/* body */}
            <div className="pv-pc-body">
                {/* main col */}
                <div className="pv-pc-main">
                    {/* description */}
                    {p.description && (
                        <div className="pv-card">
                            <h3 className="pv-card-title">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="#2d5a27" style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <path d="M14 2v6h6" stroke="#fff" strokeWidth="2" fill="none" />
                                </svg>
                                Description
                            </h3>
                            <p className="pv-card-body">{p.description}</p>
                        </div>
                    )}

                    {/* care */}
                    {careEntries.length > 0 && (
                        <div className="pv-card">
                            <h3 className="pv-card-title">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2d5a27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}>
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                </svg>
                                Care Guide
                            </h3>
                            <div className="pv-care-grid">
                                {careEntries.map(([key, value]) => (
                                    <div key={key} className="pv-care-item">
                                        <div className="pv-care-key-row">
                                            <CareIcon careKey={key} />
                                            <p className="pv-care-key">{key.replace(/_/g, ' ')}</p>
                                        </div>
                                        <p className="pv-care-val">{String(value)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}


                </div>

                {/* side col */}
                <div className="pv-pc-side">
                    {p.common_diseases && (
                        <div className="pv-card pv-card-red">
                            <h3 className="pv-card-title pv-card-title-red">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c53030" strokeWidth="2" strokeLinecap="round" style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }}>
                                    <path d="M8 2v4M16 2v4M3.5 7h17M4.5 12h15M6.5 17h11M12 6c-3.33 0-6 2.67-6 6v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7c0-3.33-2.67-6-6-6z" />
                                </svg>
                                Diseases &amp; Pests
                            </h3>
                            <p className="pv-card-body pv-card-body-red">{p.common_diseases}</p>
                        </div>
                    )}

                    <TaxonomyCard taxon={p.taxon} taxTree={taxTree} />
                </div>
            </div>
        </div>
    );
}

/* ── Main component ── */
export function ProjectPublicView() {
    const { token } = useParams({ strict: false }) as { token: string };
    const styleRef = useRef<HTMLStyleElement | null>(null);

    // Inject a <style> into <head> to override the global overflow:hidden
    // (inline styles on html/body won't beat the stylesheet specificity in all browsers)
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            html.pv-open, html.pv-open body, html.pv-open #root {
                overflow: auto !important;
                height: auto !important;
            }
        `;
        document.head.appendChild(style);
        document.documentElement.classList.add('pv-open');
        styleRef.current = style;
        return () => {
            document.documentElement.classList.remove('pv-open');
            style.remove();
        };
    }, []);

    const { data: project, isLoading, error } = useQuery({
        queryKey: ['public-project', token],
        queryFn: () => projectsApi.getByShareToken(token!),
        enabled: !!token,
        retry: false,
        // Don't keep stale data when a fetch fails — prevents showing
        // the old cached project beneath an error state.
        gcTime: 0,
        staleTime: 0,
    });

    const { data: taxTree } = useQuery({
        queryKey: ['taxonomy', 'tree'],
        queryFn: () => taxonomyApi.getTree(),
        enabled: !!project,
    });

    const isExpired = (error as any)?.response?.status === 410;
    const isNotFound = (error as any)?.response?.status === 404;

    return (
        <>
            <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');

            /* ── Public view styles ── */
            .pv-root {
                background: #fbfaf8;
                color: #1a1a1a;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                padding: 0;
                margin: 0;
                min-height: 100vh;
            }

            /* ── Brand bar ── */
            .pv-bar {
                background: #2d5a27;
                padding: 18px 32px;
                display: flex;
                align-items: flex-end;
                gap: 8px;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            @media (max-width: 640px) {
                .pv-bar { padding: 14px 16px; }
            }
            .pv-bar-logo {
                width: 28px; height: 28px;
                filter: brightness(0) invert(1);
            }
            .pv-bar-wordmark {
                color: #fff;
                font-family: 'Montserrat', sans-serif;
                font-weight: 700;
                font-size: 17px;
                letter-spacing: 0.05em;
                text-transform: uppercase;
            }
            .pv-bar-tagline {
                margin-left: auto;
                color: rgba(255,255,255,0.6);
                font-size: 12px;
            }

            /* ── Page wrapper ── */
            .pv-page {
                max-width: 960px;
                margin: 0 auto;
                padding: 40px 40px 120px;
            }
            @media (max-width: 640px) {
                .pv-page { padding: 24px 16px 60px; }
            }

            /* ── State screens ── */
            .pv-state {
                display: flex; flex-direction: column; align-items: center;
                justify-content: center; min-height: 60vh; gap: 12px; color: #666;
            }
            .pv-state-icon { opacity: 0.4; }
            .pv-state h2 { font-size: 20px; font-weight: 600; color: #333; margin: 0; }
            .pv-state p { font-size: 14px; margin: 0; }

            /* ── Spinner ── */
            .pv-spinner {
                width: 36px; height: 36px;
                border: 3px solid #e5e1d8; border-top-color: #2d5a27;
                border-radius: 50%; animation: pv-spin 0.8s linear infinite;
            }
            @keyframes pv-spin { to { transform: rotate(360deg); } }

            /* ── Cover ── */
            .pv-cover { margin-bottom: 32px; }
            .pv-cover-title {
                font-size: clamp(28px, 5vw, 44px); font-weight: 700;
                letter-spacing: -1.5px; color: #1a1a1a; margin: 0 0 12px;
            }
            .pv-cover-meta { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 10px; }
            .pv-cover-meta-item {
                display: flex; align-items: center; gap: 7px;
                font-size: 14px; color: #666;
            }
            .pv-cover-desc {
                font-size: 15px; color: #555; line-height: 1.8;
                max-width: 680px; margin-top: 10px;
            }
            .pv-divider-main {
                border: none; border-top: 1.5px solid #2d5a27; margin: 24px 0;
            }

            /* ── Section title ── */
            .pv-section-title {
                font-size: 22px; font-weight: 700; color: #2d5a27;
                margin: 0 0 20px; letter-spacing: -0.3px;
            }
            .pv-details-heading {
                font-size: 22px; font-weight: 700; color: #2d5a27;
                margin: 72px 0 28px; letter-spacing: -0.3px;
                padding-top: 24px; border-top: 1px solid #e5e1d8;
            }

            /* ── Table ── */
            .pv-inventory { overflow-x: auto; margin-bottom: 24px; }
            .pv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .pv-table thead th {
                background: #f0ede8; color: #2d5a27; font-weight: 700;
                font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase;
                padding: 12px 14px; text-align: left; border-bottom: 1.5px solid #2d5a27;
            }
            .pv-cat-row td {
                padding: 16px 14px 6px; font-weight: 700; font-size: 10px;
                letter-spacing: 1.1px; text-transform: uppercase; color: #2d5a27;
                border-left: 3px solid #2d5a27; padding-left: 14px; background: transparent;
            }
            .pv-data-row td {
                padding: 11px 14px; border-bottom: 0.5px solid #e5e1d8; vertical-align: middle;
            }
            .pv-data-row:nth-child(even) td { background: #f6f4f1; }
            .pv-num { text-align: center; color: #888; font-size: 12px; }
            .pv-plant-cell { display: flex; align-items: center; gap: 8px; }
            .pv-icon { width: 30px; height: 30px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e1d8; flex-shrink: 0; }
            .pv-plant-link {
                background: none; border: none; padding: 0; cursor: pointer;
                font-weight: 600; color: #2d5a27; font-size: 13px;
                display: inline-flex; align-items: center;
                text-decoration: none; transition: color 0.15s;
                font-family: inherit;
            }
            .pv-plant-link:hover { color: #1a3d16; text-decoration: underline; }
            .pv-sci { color: #666; font-style: italic; font-size: 12px; }
            .pv-notes { color: #555; font-size: 12px; }
            .pv-pill {
                display: inline-block; background: #f0ede8; border: 0.5px solid #e5e1d8;
                border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 700;
                color: #666; text-transform: uppercase; letter-spacing: 0.5px;
            }

            /* ── Plant cards section ── */
            .pv-plant-card {
                background: #fff; border: 0.5px solid #e5e1d8; border-radius: 20px;
                padding: 36px; margin-bottom: 32px; box-shadow: 0 1px 6px rgba(0,0,0,0.04);
                scroll-margin-top: 80px;
            }
            .pv-pc-header {
                display: flex; gap: 28px; justify-content: space-between;
                align-items: flex-start; margin-bottom: 24px;
            }
            .pv-pc-header-left { flex: 1; min-width: 0; }
            .pv-pc-name-row { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 14px; }
            .pv-pc-icon { width: 72px; height: 72px; object-fit: cover; border-radius: 14px; border: 1px solid #e5e1d8; flex-shrink: 0; }
            .pv-pc-index { font-size: 11px; color: #bbb; font-weight: 600; margin: 0 0 4px; }
            .pv-pc-name { font-size: clamp(22px, 4vw, 30px); font-weight: 700; letter-spacing: -0.5px; margin: 0 0 5px; color: #1a1a1a; line-height: 1.1; }
            .pv-pc-sci { font-size: 14px; font-style: italic; color: #888; margin: 0; }
            .pv-pills-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
            .pv-pc-hero { width: 240px; height: 180px; object-fit: cover; border-radius: 14px; border: 1px solid #e5e1d8; flex-shrink: 0; }
            @media (max-width: 600px) {
                .pv-pc-header { flex-direction: column-reverse; }
                .pv-pc-hero { width: 100%; height: 220px; }
            }

            .pv-divider { border: none; border-top: 0.5px solid #e5e1d8; margin: 20px 0 24px; }
            .pv-pc-body { display: flex; gap: 28px; }
            .pv-pc-main { flex: 7; display: flex; flex-direction: column; gap: 18px; }
            .pv-pc-side { flex: 4; display: flex; flex-direction: column; gap: 18px; }
            @media (max-width: 700px) { .pv-pc-body { flex-direction: column; } }

            /* ── Inner cards ── */
            .pv-card {
                background: #fff; border: 0.5px solid #e5e1d8; border-radius: 12px; padding: 18px;
            }
            .pv-card-red { background: #fff5f5; border-color: #fed7d7; }
            .pv-card-title {
                font-size: 11px; font-weight: 700; color: #2d5a27; text-transform: uppercase;
                letter-spacing: 0.5px; margin: 0 0 12px; padding-bottom: 10px;
                border-bottom: 0.5px solid #e5e1d8; display: flex; align-items: center; gap: 5px;
            }
            .pv-card-title svg { flex-shrink: 0; }
            .pv-card-title-red { color: #c53030; border-bottom-color: #fed7d7; }
            .pv-card-body { font-size: 14px; color: #1a1a1a; line-height: 1.75; margin: 0; }
            .pv-card-body-red { color: #742a2a; }

            /* ── Care grid ── */
            .pv-care-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            @media (max-width: 500px) { .pv-care-grid { grid-template-columns: 1fr; } }
            .pv-care-item { background: #f0ede8; border-radius: 10px; padding: 14px; }
            .pv-care-key-row { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; }
            .pv-care-key-row svg { flex-shrink: 0; }
            .pv-care-key {
                font-size: 9px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.7px; color: #2d5a27; margin: 0;
            }
            .pv-care-val { font-size: 12px; color: #1a1a1a; margin: 0; line-height: 1.5; }

            /* ── Taxonomy ── */
            .pv-tax-list { display: flex; flex-direction: column; }
            .pv-tax-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 8px 0; border-bottom: 0.5px solid #e5e1d8;
            }
            .pv-tax-last { border-bottom: none; }
            .pv-tax-rank {
                font-size: 9px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.8px; color: #999;
            }
            .pv-tax-name { font-size: 12px; color: #1a1a1a; text-align: right; }

            /* ── Footer ── */
            .pv-footer {
                text-align: center; padding: 24px; color: #aaa; font-size: 12px;
                border-top: 1px solid #e5e1d8; margin-top: 40px;
            }
            `}</style>

            <div className="pv-root">
                {/* top bar */}
                <div className="pv-bar">
                    <img src="/logo.svg" alt="Landschaft" className="pv-bar-logo" />
                    <span className="pv-bar-wordmark">Landschaft</span>
                    <span className="pv-bar-tagline">Shared Report</span>
                </div>

                <div className="pv-page">
                    {/* loading */}
                    {isLoading && (
                        <div className="pv-state">
                            <div className="pv-spinner" />
                            <p>Loading project…</p>
                        </div>
                    )}

                    {/* expired */}
                    {isExpired && (
                        <div className="pv-state">
                            <AlertTriangle size={40} className="pv-state-icon" strokeWidth={1.5} />
                            <h2>Link Expired</h2>
                            <p>This share link has expired. Ask the project owner to regenerate it.</p>
                        </div>
                    )}

                    {/* not found */}
                    {isNotFound && (
                        <div className="pv-state">
                            <Leaf size={40} className="pv-state-icon" strokeWidth={1.5} />
                            <h2>Project Not Found</h2>
                            <p>This link has expired.</p>
                        </div>
                    )}

                    {/* content */}
                    {project && !error && (
                        <>
                            {/* cover */}
                            <div className="pv-cover">
                                <h1 className="pv-cover-title">{project.name}</h1>
                                <div className="pv-cover-meta">
                                    {project.client_name && (
                                        <span className="pv-cover-meta-item">
                                            <User size={14} />
                                            {project.client_name}
                                        </span>
                                    )}
                                    {project.location && (
                                        <span className="pv-cover-meta-item">
                                            <MapPin size={14} />
                                            {project.location}
                                        </span>
                                    )}
                                    <span className="pv-cover-meta-item">
                                        <Calendar size={14} />
                                        {formatDate(project.created_at)}
                                    </span>
                                </div>
                                {project.description && (
                                    <p className="pv-cover-desc">{project.description}</p>
                                )}
                            </div>

                            <hr className="pv-divider-main" />

                            {/* inventory table */}
                            <h2 className="pv-section-title">Project Inventory</h2>
                            {project.plants.length === 0 ? (
                                <p style={{ color: '#888', fontSize: 14 }}>No plants in this project.</p>
                            ) : (
                                <GroupedInventory project={project} />
                            )}

                            {/* per-plant detail cards */}
                            {project.plants.length > 0 && (
                                <>
                                    <h2 className="pv-details-heading">Plant Details</h2>
                                    {project.plants.map((pp, i) =>
                                        pp.plant ? (
                                            <PlantCard
                                                key={pp.plant_id}
                                                pp={pp}
                                                index={i + 1}
                                                taxTree={taxTree}
                                            />
                                        ) : null
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="pv-footer">
                    Generated by Landschaft Plants Database
                </div>
            </div>
        </>
    );
}
