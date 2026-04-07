import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ioApi } from '../../api/io';
import { aiApi } from '../../api/ai';
import { categoriesApi } from '../../api/categories';
import { useAlert } from '../../contexts/AlertContext';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib-frontend/utils';
import {
    ArrowLeft, Upload, FileUp, Loader2, Trash2, Plus,
    AlertCircle, ChevronRight, Info, X, ImageOff, RefreshCw, Maximize2,
    Copy, Check, Sparkles,
} from 'lucide-react';

// ── Field config ─────────────────────────────────────────────────────────────
const ALL_FIELDS: { key: string; label: string; width: string; required?: boolean; isImage?: boolean; isSticky?: boolean }[] = [
    { key: 'common_name', label: 'Common Name', width: '160px', required: true, isSticky: true },
    { key: 'scientific_name', label: 'Scientific Name', width: '160px' },
    { key: 'category', label: 'Category', width: '120px' },
    { key: 'planting_place', label: 'Planting Place', width: '130px' },
    { key: 'kingdom', label: 'Kingdom', width: '110px', required: true },
    { key: 'division', label: 'Division', width: '110px' },
    { key: 'class', label: 'Class', width: '110px' },
    { key: 'order', label: 'Order', width: '110px' },
    { key: 'family', label: 'Family', width: '110px' },
    { key: 'genus', label: 'Genus', width: '110px' },
    { key: 'species', label: 'Species', width: '110px', required: true },
    { key: 'description', label: 'Description', width: '200px' },
    { key: 'common_diseases', label: 'Diseases', width: '180px' },
    { key: 'care_water', label: 'Water', width: '140px' },
    { key: 'care_sunlight', label: 'Sunlight', width: '140px' },
    { key: 'care_soil', label: 'Soil', width: '140px' },
    { key: 'care_maintenance', label: 'Maintenance', width: '140px' },
    { key: 'icon_url', label: 'Icon URL', width: '320px', isImage: true },
    { key: 'image_url', label: 'Image URL', width: '320px', isImage: true },
];

const BLANK_ROW = (): Record<string, string> =>
    Object.fromEntries(ALL_FIELDS.map(f => [f.key, '']));

type Stage = 'upload' | 'edit';

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
    useEffect(() => {
        setImgError(false);
    }, [url]);

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
}) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
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
                        onClick={onClose}
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

export const CsvImportPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();

    const [stage, setStage] = useState<Stage>('upload');
    const [isDragOver, setIsDragOver] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [fileName, setFileName] = useState('');
    const [parseErrors, setParseErrors] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);

    // Categories for the prompt
    const { data: categoriesOptions } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });

    const categoriesList = useMemo(() => {
        if (!categoriesOptions || categoriesOptions.items.length === 0) return "Tree, Shrub, Palm, Creeper, Groundcover, Climber, Fern, Grass, Succulent, Aquatic, Other";
        return categoriesOptions.items.map(c => c.name).join(", ");
    }, [categoriesOptions]);

    const bulkImportPrompt = useMemo(() => `Act as a botanical data expert. 

Task: Generate a perfectly formatted CSV file for the plants listed below.

Header (MUST be the first line of your response):
kingdom,division,class,order,family,genus,species,common_name,scientific_name,category,planting_place,description,common_diseases,care_water,care_sunlight,care_soil,care_maintenance,icon_url,image_url

Strict Requirements (CRITICAL):
1. MANDATORY FIELDS: Every single column must have a value. DO NOT skip any columns.
2. SPECIES COLUMN: This is the specific epithet (the second word of the scientific name). For example, if the scientific name is "Psidium guajava", the species is "guajava". DO NOT leave the species column blank.
3. CATEGORY: MUST be exactly one of [${categoriesList}].
4. PLACE: MUST be exactly one of [Indoor, Outdoor, Indoor & Outdoor].
5. IMAGES: Use Wikimedia Special:FilePath URLs based on the scientific name (e.g. .../Special:FilePath/Scientific_Name.jpg?width=1000).
6. FORMATTING: Raw CSV text only. No markdown blocks (no \` \` \`), no explanations, no "Here is your CSV".

List of Plants to Process:
[PASTE YOUR PLANT NAMES HERE]`, [categoriesList]);

    const handleCopyPrompt = () => {
        navigator.clipboard.writeText(bulkImportPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // The editable rows
    const [rows, setRows] = useState<Record<string, string>[]>([BLANK_ROW()]);

    // Lightbox & Regeneration state
    const [lightbox, setLightbox] = useState<{
        url: string;
        label: string;
        rowIdx: number;
        fieldKey: string;
        plantName: string;
    } | null>(null);
    const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});
    const [regeneratePages, setRegeneratePages] = useState<Record<string, number>>({});

    const handleRegenerate = async (rowIdx: number, fieldKey: string, plantName: string) => {
        const searchName = plantName.trim();
        if (!searchName) return;

        const key = `${rowIdx}_${fieldKey}`;
        setIsRegenerating(prev => ({ ...prev, [key]: true }));

        try {
            const currentPage = regeneratePages[key] || 1;
            const nextPage = currentPage + 1;

            const data = await aiApi.fetchPlantImages({ plantName: searchName, page: nextPage });

            setRegeneratePages(prev => ({ ...prev, [key]: data.page }));

            const newUrl = fieldKey === 'icon_url' ? data.icon_url : data.image_url;
            if (newUrl) {
                updateCell(rowIdx, fieldKey, newUrl);
                // If lightbox is open for this cell, update it too
                if (lightbox && lightbox.rowIdx === rowIdx && lightbox.fieldKey === fieldKey) {
                    setLightbox(prev => prev ? { ...prev, url: newUrl } : null);
                }
            }
        } catch (error) {
            console.error('Failed to regenerate image:', error);
        } finally {
            setIsRegenerating(prev => ({ ...prev, [key]: false }));
        }
    };

    // ── File handling ──────────────────────────────────────────────────────
    const processFile = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showAlert('Please upload a valid .csv file.', 'error');
            return;
        }
        setIsPreviewing(true);
        try {
            const result = await ioApi.previewCsv(file);
            setFileName(file.name);
            setParseErrors(result.errors);
            setRows(result.rows.length > 0 ? result.rows : [BLANK_ROW()]);
            setStage('edit');
        } catch (err: any) {
            showAlert('Could not parse CSV: ' + (err.response?.data?.detail || err.message), 'error');
        } finally {
            setIsPreviewing(false);
        }
    }, [showAlert]);

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) await processFile(file);
    }, [processFile]);

    const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processFile(file);
    }, [processFile]);

    // ── Row editing ───────────────────────────────────────────────────────
    const updateCell = (rowIdx: number, key: string, value: string) => {
        setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r));
    };

    const addRow = () => setRows(prev => [...prev, BLANK_ROW()]);

    const deleteRow = (idx: number) =>
        setRows(prev => prev.length === 1 ? [BLANK_ROW()] : prev.filter((_, i) => i !== idx));

    // ── Import ────────────────────────────────────────────────────────────
    const handleImport = async () => {
        const nonEmpty = rows.filter(r => r.common_name?.trim() || r.species?.trim());
        if (nonEmpty.length === 0) {
            showAlert('No plants to import. Fill in at least one row.', 'warning');
            return;
        }
        setIsImporting(true);
        try {
            const result = await ioApi.importRows(nonEmpty);
            showAlert(
                `Import complete! ✓ ${result.success} added${result.failed ? `, ✗ ${result.failed} failed` : ''}.`,
                'success'
            );
            queryClient.invalidateQueries({ queryKey: ['plants'] });
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            navigate({ to: '/plants' });
        } catch (err: any) {
            showAlert('Import failed: ' + (err.response?.data?.detail || err.message), 'error');
        } finally {
            setIsImporting(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <>
            {/* ── Lightbox ──────────────────────────────────────────────── */}
            {lightbox && (
                <Lightbox
                    url={lightbox.url}
                    label={lightbox.label}
                    onClose={() => setLightbox(null)}
                />
            )}

            <div className="flex flex-col h-full min-h-[calc(100vh-8rem)]">

                {/* ── Page header ─────────────────────────────────────────── */}
                <div className="flex items-center gap-3 mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate({ to: '/plants' })}
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft size={15} />
                        Plants
                    </Button>
                    <ChevronRight size={14} className="text-muted-foreground/50" />
                    <span className="text-sm font-medium text-foreground">
                        {stage === 'upload' ? 'Import from CSV' : (
                            <span className="flex items-center gap-2">
                                Import Preview
                                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {rows.filter(r => r.common_name?.trim()).length} plants
                                </span>
                            </span>
                        )}
                    </span>
                </div>

                {/* ══════════════════════════════════════════════════════════ */}
                {/* STAGE 1: Upload                                            */}
                {/* ══════════════════════════════════════════════════════════ */}
                {stage === 'upload' && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-2xl mx-auto w-full">
                        <div className="w-full space-y-2 text-center">
                            <h1 className="text-2xl font-bold text-foreground">Import Plants from CSV</h1>
                            <p className="text-sm text-muted-foreground">
                                Upload a CSV file — you can review and edit every field before importing.
                            </p>
                        </div>

                        {/* Drop zone */}
                        <label className="w-full">
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={handleFileInput}
                                disabled={isPreviewing}
                            />
                            <div
                                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={handleDrop}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer select-none',
                                    isPreviewing
                                        ? 'border-primary/40 bg-primary/5 cursor-wait'
                                        : isDragOver
                                            ? 'border-primary bg-primary/8 scale-[1.01] shadow-lg shadow-primary/10'
                                            : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
                                )}
                            >
                                <div className={cn(
                                    'flex items-center justify-center w-14 h-14 rounded-2xl transition-colors',
                                    isDragOver ? 'bg-primary/15' : 'bg-muted'
                                )}>
                                    {isPreviewing
                                        ? <Loader2 size={24} className="text-primary animate-spin" />
                                        : <FileUp size={24} className={isDragOver ? 'text-primary' : 'text-muted-foreground'} />
                                    }
                                </div>
                                <div className="space-y-1.5">
                                    <p className={cn('text-base font-semibold', isDragOver ? 'text-primary' : 'text-foreground')}>
                                        {isPreviewing ? 'Reading CSV…' : isDragOver ? 'Drop to preview' : 'Drag & drop your CSV file'}
                                    </p>
                                    {!isPreviewing && (
                                        <p className="text-sm text-muted-foreground">
                                            or click to <span className="text-primary font-medium">browse files</span>
                                        </p>
                                    )}
                                </div>
                                <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest bg-background/70 px-3 py-1 rounded-full border border-border/50">
                                    .csv only
                                </span>
                            </div>
                        </label>

                        <div className="w-full space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <Sparkles size={16} className="text-emerald-500" />
                                    AI Prompt for CSV Generation
                                </h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopyPrompt}
                                    className="h-8 gap-1.5 text-xs font-bold border-primary/20 hover:bg-primary/5"
                                >
                                    {copied ? <><Check size={13} className="text-emerald-600" /> COPIED</> : <><Copy size={13} /> COPY PROMPT</>}
                                </Button>
                            </div>
                            <div className="rounded-xl border border-border bg-muted/30 p-4 relative group">
                                <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono overflow-auto max-h-[200px]">
                                    {bulkImportPrompt}
                                </pre>
                            </div>
                            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex gap-3">
                                <Info size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-800 leading-relaxed">
                                    Copy the prompt above and paste it into ChatGPT/Claude along with your list of plants. Then download the resulting CSV and upload it here.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* STAGE 2: Editable spreadsheet                              */}
                {/* ══════════════════════════════════════════════════════════ */}
                {stage === 'edit' && (
                    <div className="flex-1 flex flex-col gap-4 min-h-0">

                        {/* Parse errors */}
                        {parseErrors.length > 0 && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-red-700">
                                    {parseErrors.map((e, i) => <p key={i}>{e}</p>)}
                                </div>
                            </div>
                        )}

                        {/* Info + actions bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <FileUp size={14} className="text-primary" />
                                    <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-[200px]">{fileName || 'Manual entry'}</span>
                                    <span>·</span>
                                    <span className="whitespace-nowrap">{rows.filter(r => r.common_name?.trim()).length} plants</span>
                                </div>
                                <button
                                    onClick={() => { setStage('upload'); setParseErrors([]); }}
                                    className="text-xs text-primary hover:underline font-medium"
                                >
                                    Re-upload
                                </button>
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <Button
                                    size="sm"
                                    onClick={addRow}
                                    className="flex-1 sm:flex-initial gap-1.5 h-8 text-[11px] font-bold"
                                >
                                    <Plus size={13} /> Add Row
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleImport}
                                    disabled={isImporting || parseErrors.length > 0}
                                    className="flex-1 sm:flex-initial gap-1.5 h-8 text-[11px] font-bold bg-primary hover:bg-primary/90"
                                >
                                    {isImporting ? (
                                        <><Loader2 size={13} className="animate-spin" /> Importing…</>
                                    ) : (
                                        <><Upload size={13} /> Confirm Import</>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Spreadsheet */}
                        <div className="flex-1 min-h-0 rounded-xl border border-border overflow-hidden shadow-sm bg-white">
                            <div className="overflow-auto h-full max-h-[calc(100vh-18rem)] overscroll-behavior-x-contain">
                                <table className="border-collapse text-xs" style={{ width: 'max-content', minWidth: '100%' }}>
                                    <thead className="sticky top-0 z-20 bg-muted shadow-sm">
                                        <tr>
                                            {/* Row number */}
                                            <th className="w-9 min-w-[36px] text-center text-[10px] font-bold text-muted-foreground/60 border-b border-r border-border px-1 py-2 bg-muted md:sticky md:left-0 z-30">
                                                #
                                            </th>
                                            {ALL_FIELDS.map(f => (
                                                <th
                                                    key={f.key}
                                                    className={cn(
                                                        "text-left px-2 py-2 border-b border-r border-border font-bold text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                                                        f.isSticky ? "md:sticky md:left-[36px] z-40 bg-muted" : "z-20"
                                                    )}
                                                    style={{ minWidth: f.width }}
                                                >
                                                    {f.label}
                                                    {f.required && <span className="text-red-400 ml-0.5">*</span>}
                                                </th>
                                            ))}
                                            {/* Delete col */}
                                            <th className="w-9 border-b border-border bg-muted" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, rowIdx) => {
                                            const isEmpty = !row.common_name?.trim() && !row.species?.trim();
                                            return (
                                                <tr
                                                    key={rowIdx}
                                                    className={cn(
                                                        'group',
                                                        rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#f9fafb]',
                                                        isEmpty ? 'opacity-50' : ''
                                                    )}
                                                >
                                                    {/* Row num */}
                                                    <td className={cn(
                                                        "text-center text-[10px] text-muted-foreground/40 tabular-nums border-r border-b border-border px-1 md:sticky md:left-0 z-10 align-top pt-2",
                                                        rowIdx % 2 === 0 ? "bg-white" : "bg-[#f9fafb]"
                                                    )}>
                                                        {rowIdx + 1}
                                                    </td>
                                                    {ALL_FIELDS.map(f => (
                                                        <td key={f.key} className={cn(
                                                            "border-r border-b border-border p-0 align-top",
                                                            f.isSticky ? (rowIdx % 2 === 0 ? "md:sticky md:left-[36px] z-10 bg-white" : "md:sticky md:left-[36px] z-10 bg-[#f9fafb]") : ""
                                                        )}>
                                                            {f.isImage ? (
                                                                <ImageCell
                                                                    url={row[f.key] ?? ''}
                                                                    fieldKey={f.key}
                                                                    rowIdx={rowIdx}
                                                                    plantName={row.common_name || row.scientific_name || ''}
                                                                    onChange={updateCell}
                                                                    onZoom={setLightbox}
                                                                    onRegenerate={handleRegenerate}
                                                                    isRegenerating={!!isRegenerating[`${rowIdx}_${f.key}`]}
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={row[f.key] ?? ''}
                                                                    onChange={e => updateCell(rowIdx, f.key, e.target.value)}
                                                                    rows={1}
                                                                    className={cn(
                                                                        'w-full h-full min-h-[32px] px-2 py-1.5 text-xs bg-transparent resize-none p-2',
                                                                        'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-primary/3',
                                                                        'placeholder:text-muted-foreground/30 transition-colors'
                                                                    )}
                                                                    style={{ minWidth: f.width, height: f.isImage ? '80px' : 'auto', minHeight: '80px' }}
                                                                    placeholder={f.required ? '(required)' : ''}
                                                                />
                                                            )}
                                                        </td>
                                                    ))}
                                                    {/* Delete */}
                                                    <td className="border-b border-border p-0 text-center align-top pt-2">
                                                        <button
                                                            onClick={() => deleteRow(rowIdx)}
                                                            className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors"
                                                            title="Remove row"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer hint */}
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Info size={12} className="text-amber-500 shrink-0" />
                            Blank fields (description, care data, images) will be auto-filled by AI during import.
                            Required fields are marked <span className="text-red-400 font-bold">*</span>.
                        </p>
                    </div>
                )}
                {/* Lightbox */}
                {lightbox && (
                    <Lightbox
                        {...lightbox}
                        onClose={() => setLightbox(null)}
                        onRegenerate={() => handleRegenerate(lightbox.rowIdx, lightbox.fieldKey, lightbox.plantName)}
                        isRegenerating={!!isRegenerating[`${lightbox.rowIdx}_${lightbox.fieldKey}`]}
                    />
                )}
            </div>
        </>
    );
};
