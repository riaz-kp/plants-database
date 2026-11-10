import { useEffect, useState, type ReactNode } from 'react';
import { ImageOff, Loader2, Maximize2, RefreshCw, Trash2, X } from 'lucide-react';
import { aiApi } from '../../api/ai';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib-frontend/utils';
import { CSV_FIELDS } from './plantImport';

// ── Inline image thumbnail cell ───────────────────────────────────────────────
const ImageCell = ({
    url,
    fieldKey,
    rowIdx,
    plantName,
    onChange,
    onZoom,
    onRegenerate,
    isRegenerating,
}: {
    url: string;
    fieldKey: string;
    rowIdx: number;
    plantName: string;
    onChange: (rowIdx: number, key: string, val: string) => void;
    onZoom: (data: { url: string; label: string; rowIdx: number; fieldKey: string; plantName: string }) => void;
    onRegenerate: (rowIdx: number, fieldKey: string, plantName: string) => Promise<void>;
    isRegenerating: boolean;
}) => {
    const [imgError, setImgError] = useState(false);
    const hasUrl = url.trim().startsWith('http');
    const label = fieldKey === 'icon_url' ? 'Icon' : 'Image';

    const handleUrlChange = (val: string) => {
        setImgError(false);
        onChange(rowIdx, fieldKey, val);
    };

    // Reset error state when URL changes externally (e.g. via regeneration)
    const [shownUrl, setShownUrl] = useState(url);
    if (url !== shownUrl) {
        setShownUrl(url);
        setImgError(false);
    }

    return (
        <div className="flex h-[80px] w-full items-stretch">
            {/* Thumbnail - Square Crop */}
            <div
                className={cn(
                    "relative w-20 h-20 shrink-0 bg-muted/20 border-r border-border/40 overflow-hidden group/img transition-all",
                    hasUrl && !imgError ? "cursor-zoom-in" : ""
                )}
                onClick={() => {
                    if (hasUrl && !imgError) {
                        onZoom({ url, label, rowIdx, fieldKey, plantName });
                    }
                }}
            >
                {hasUrl && !imgError ? (
                    <>
                        <img
                            src={url}
                            alt=""
                            onError={() => setImgError(true)}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-110"
                        />
                        {/* Zoom hint overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                            <Maximize2
                                size={18}
                                className="text-white opacity-0 group-hover/img:opacity-100 transition-all scale-75 group-hover/img:scale-100 drop-shadow-lg"
                            />
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        {hasUrl && imgError
                            ? <ImageOff size={16} className="text-red-400" />
                            : <div className="w-5 h-5 rounded-full bg-muted-foreground/10 border border-border/40" />
                        }
                    </div>
                )}

                {/* Regenerate button - Float it over the top-right */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate(rowIdx, fieldKey, plantName);
                    }}
                    disabled={isRegenerating || !plantName.trim()}
                    className={cn(
                        'absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-lg transition-all shadow-md backdrop-blur-md z-10',
                        'bg-black/60 hover:bg-primary text-white',
                        'disabled:opacity-20 disabled:cursor-not-allowed'
                    )}
                    title="Fetch new image"
                >
                    {isRegenerating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                </button>
            </div>

            {/* URL input */}
            <div className="flex-1 min-w-0">
                <textarea
                    value={url}
                    onChange={e => handleUrlChange(e.target.value)}
                    className={cn(
                        'w-full h-full px-2 py-2 text-[11px] bg-transparent resize-none leading-relaxed',
                        'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-primary/3',
                        'placeholder:text-muted-foreground/20 transition-colors'
                    )}
                    placeholder="https://…"
                />
            </div>
        </div>
    );
};

// ── Lightbox overlay ──────────────────────────────────────────────────────────
const Lightbox = ({
    url,
    label,
    onClose,
    onRegenerate,
    isRegenerating,
}: {
    url: string;
    label: string;
    onClose: () => void;
    onRegenerate?: () => Promise<void>;
    isRegenerating?: boolean;
}) => {
    // Escape closes it, like the app's other dialogs
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8"
            onClick={onClose}
        >
            <div
                className="relative max-w-4xl w-full max-h-full flex flex-col gap-4"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                    <div className="px-5 py-4 bg-muted/40 border-b border-border/40 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                            {onRegenerate && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={onRegenerate}
                                    disabled={isRegenerating}
                                    className="h-7 px-3 text-[10px] gap-2 rounded-lg bg-white shadow-sm hover:bg-primary hover:text-white border-primary/20 transition-all font-bold"
                                >
                                    {isRegenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    REGENERATE
                                </Button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted/50 text-foreground hover:bg-red-50 hover:text-red-500 transition-all"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="bg-muted/10 p-2 min-h-[40vh] flex items-center justify-center">
                        <img
                            src={url}
                            alt={label}
                            className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-lg"
                        />
                    </div>
                    <div className="px-5 py-3 bg-white border-t border-border/40 overflow-hidden">
                        <p className="text-[11px] font-mono text-muted-foreground/60 break-all select-all">{url}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

type LightboxState = { url: string; label: string; rowIdx: number; fieldKey: string; plantName: string };

/** A column in front of the plant columns, replacing the row number */
export interface CsvRowsLead {
    header: ReactNode;
    /** Pixels; the sticky name column starts after it */
    width: number;
    render: (rowIdx: number) => ReactNode;
}

/**
 * Spreadsheet of import CSV rows: every column editable, image columns with
 * thumbnails, zoom and "fetch another image".
 */
export function CsvRowsTable({
    rows,
    onCellChange,
    onDeleteRow,
    lead,
    rowClassName,
    className,
}: {
    rows: Record<string, string>[];
    onCellChange: (rowIdx: number, key: string, value: string) => void;
    /** Shows a delete button per row when given */
    onDeleteRow?: (rowIdx: number) => void;
    lead?: CsvRowsLead;
    /** Extra classes for a row, e.g. to dim rows left out */
    rowClassName?: (rowIdx: number) => string | undefined;
    /** Size of the scroll box */
    className?: string;
}) {
    const leadWidth = lead?.width ?? 36;
    const [lightbox, setLightbox] = useState<LightboxState | null>(null);
    const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});
    const [regeneratePages, setRegeneratePages] = useState<Record<string, number>>({});

    const handleRegenerate = async (rowIdx: number, fieldKey: string, plantName: string) => {
        const searchName = plantName.trim();
        if (!searchName) return;

        const key = `${rowIdx}_${fieldKey}`;
        setIsRegenerating(prev => ({ ...prev, [key]: true }));
        try {
            const nextPage = (regeneratePages[key] || 1) + 1;
            const data = await aiApi.fetchPlantImages({ plantName: searchName, page: nextPage });
            setRegeneratePages(prev => ({ ...prev, [key]: data.page }));

            const newUrl = fieldKey === 'icon_url' ? data.icon_url : data.image_url;
            if (newUrl) {
                onCellChange(rowIdx, fieldKey, newUrl);
                // If the lightbox shows this cell, update it too
                setLightbox(prev => prev && prev.rowIdx === rowIdx && prev.fieldKey === fieldKey ? { ...prev, url: newUrl } : prev);
            }
        } catch (error) {
            console.error('Failed to regenerate image:', error);
        } finally {
            setIsRegenerating(prev => ({ ...prev, [key]: false }));
        }
    };

    const stripe = (rowIdx: number) => (rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]');

    return (
        <>
            <div className={cn('rounded-xl border border-border overflow-hidden shadow-sm bg-white', className)}>
                <div className="overflow-auto h-full max-h-[inherit] overscroll-behavior-x-contain">
                    <table className="border-collapse text-xs" style={{ width: 'max-content', minWidth: '100%' }}>
                        <thead className="sticky top-0 z-20 bg-muted shadow-sm">
                            <tr>
                                <th
                                    className="text-center text-[10px] font-bold text-muted-foreground/60 border-b border-r border-border px-1 py-2 bg-muted md:sticky md:left-0 z-30"
                                    style={{ width: leadWidth, minWidth: leadWidth }}
                                >
                                    {lead ? lead.header : '#'}
                                </th>
                                {CSV_FIELDS.map(f => (
                                    <th
                                        key={f.key}
                                        className={cn(
                                            "text-left px-2 py-2 border-b border-r border-border font-bold text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                                            f.isSticky ? "md:sticky z-40 bg-muted" : "z-20"
                                        )}
                                        style={{ minWidth: f.width, left: f.isSticky ? leadWidth : undefined }}
                                    >
                                        {f.label}
                                        {f.required && <span className="text-red-400 ml-0.5">*</span>}
                                    </th>
                                ))}
                                {onDeleteRow && <th className="w-9 border-b border-border bg-muted" />}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIdx) => {
                                const isEmpty = !row.common_name?.trim() && !row.species?.trim();
                                return (
                                    <tr
                                        key={rowIdx}
                                        className={cn('group', stripe(rowIdx), isEmpty && 'opacity-50', rowClassName?.(rowIdx))}
                                    >
                                        <td
                                            className={cn(
                                                "border-r border-b border-border px-1 md:sticky md:left-0 z-10 align-top pt-2",
                                                lead ? '' : 'text-center text-[10px] text-muted-foreground/40 tabular-nums',
                                                stripe(rowIdx)
                                            )}
                                            style={{ width: leadWidth, minWidth: leadWidth }}
                                        >
                                            {lead ? lead.render(rowIdx) : rowIdx + 1}
                                        </td>
                                        {CSV_FIELDS.map(f => (
                                            <td
                                                key={f.key}
                                                className={cn(
                                                    "border-r border-b border-border p-0 align-top",
                                                    f.isSticky && cn('md:sticky z-10', stripe(rowIdx))
                                                )}
                                                style={{ left: f.isSticky ? leadWidth : undefined }}
                                            >
                                                {f.isImage ? (
                                                    <ImageCell
                                                        url={row[f.key] ?? ''}
                                                        fieldKey={f.key}
                                                        rowIdx={rowIdx}
                                                        plantName={row.common_name || row.scientific_name || ''}
                                                        onChange={onCellChange}
                                                        onZoom={setLightbox}
                                                        onRegenerate={handleRegenerate}
                                                        isRegenerating={!!isRegenerating[`${rowIdx}_${f.key}`]}
                                                    />
                                                ) : (
                                                    <textarea
                                                        value={row[f.key] ?? ''}
                                                        onChange={e => onCellChange(rowIdx, f.key, e.target.value)}
                                                        rows={1}
                                                        aria-label={`${f.label}, row ${rowIdx + 1}`}
                                                        className={cn(
                                                            'w-full h-full min-h-[32px] px-2 py-1.5 text-xs bg-transparent resize-none p-2',
                                                            'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-primary/3',
                                                            'placeholder:text-muted-foreground/30 transition-colors'
                                                        )}
                                                        style={{ minWidth: f.width, minHeight: '80px' }}
                                                        placeholder={f.required ? '(required)' : ''}
                                                    />
                                                )}
                                            </td>
                                        ))}
                                        {onDeleteRow && (
                                            <td className="border-b border-border p-0 text-center align-top pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onDeleteRow(rowIdx)}
                                                    className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors"
                                                    title="Remove row"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            {lightbox && (
                <Lightbox
                    url={lightbox.url}
                    label={lightbox.label}
                    onClose={() => setLightbox(null)}
                    onRegenerate={() => handleRegenerate(lightbox.rowIdx, lightbox.fieldKey, lightbox.plantName)}
                    isRegenerating={!!isRegenerating[`${lightbox.rowIdx}_${lightbox.fieldKey}`]}
                />
            )}
        </>
    );
}
