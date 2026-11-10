import { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ioApi } from '../../api/io';
import { categoriesApi } from '../../api/categories';
import { useAlert } from '../../contexts/AlertContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cleanPastedCsv } from './csvPaste';
import { ImportProgressOverlay } from './ImportProgressOverlay';
import { CsvRowsTable } from './CsvRowsTable';
import {
    blankCsvRow, buildBulkImportPrompt, DEFAULT_CATEGORY_LIST, errorMessage, prepareImportRow, rowName, useImportClock,
    type ImportJob,
} from './plantImport';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '../../lib-frontend/utils';
import {
    ArrowLeft, Upload, FileUp, Loader2, Plus,
    AlertCircle, ChevronRight, Info,
    Copy, Check, Sparkles, AlertTriangle, ClipboardPaste,
} from 'lucide-react';

type Stage = 'upload' | 'edit';
const PASTED_NAME = 'Pasted CSV';

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
    const [inputMode, setInputMode] = useState<'file' | 'paste'>('paste');
    const [pastedCsv, setPastedCsv] = useState('');

    // Categories for the prompt
    const { data: categoriesOptions } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });

    const categoriesList = useMemo(() => {
        if (!categoriesOptions || categoriesOptions.items.length === 0) return DEFAULT_CATEGORY_LIST;
        return categoriesOptions.items.map(c => c.name).join(", ");
    }, [categoriesOptions]);

    const bulkImportPrompt = useMemo(() => buildBulkImportPrompt(categoriesList), [categoriesList]);

    const handleCopyPrompt = () => {
        navigator.clipboard.writeText(bulkImportPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // The editable rows
    const [rows, setRows] = useState<Record<string, string>[]>([blankCsvRow()]);

    const [duplicateImportData, setDuplicateImportData] = useState<{
        duplicates: Array<{
            row_index: number;
            common_name: string;
            scientific_name: string;
            existing_plant_id?: string;
        }>;
        rowsToImport: Record<string, string>[];
    } | null>(null);

    // ── File handling ──────────────────────────────────────────────────────
    const processFile = useCallback(async (file: File, displayName?: string) => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showAlert('Please upload a valid .csv file.', 'error');
            return;
        }
        setIsPreviewing(true);
        try {
            const result = await ioApi.previewCsv(file);
            setFileName(displayName ?? file.name);
            setParseErrors(result.errors);
            setRows(result.rows.length > 0 ? result.rows : [blankCsvRow()]);
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
        // Reset so picking the same file again still fires onChange
        e.target.value = '';
        if (file) await processFile(file);
    }, [processFile]);

    /** Send pasted CSV text through the same preview endpoint as an uploaded file. */
    const handlePastePreview = useCallback(async () => {
        const { text, lostLineBreaks } = cleanPastedCsv(pastedCsv);
        if (!text) {
            showAlert('Paste some CSV text first.', 'error');
            return;
        }
        if (lostLineBreaks) {
            showAlert(
                'The pasted CSV is on one line, so its rows could not be separated. '
                + 'Copy it again using the copy button on the code block, or upload the file.',
                'error',
            );
            return;
        }
        await processFile(new File([text], 'pasted.csv', { type: 'text/csv' }), PASTED_NAME);
    }, [pastedCsv, processFile, showAlert]);

    // ── Row editing ───────────────────────────────────────────────────────
    const updateCell = (rowIdx: number, key: string, value: string) => {
        setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r));
    };

    const addRow = () => setRows(prev => [...prev, blankCsvRow()]);

    const deleteRow = (idx: number) =>
        setRows(prev => prev.length === 1 ? [blankCsvRow()] : prev.filter((_, i) => i !== idx));

    // ── Import ────────────────────────────────────────────────────────────
    const [importJobs, setImportJobs] = useState<ImportJob[] | null>(null);
    const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
    const [importRunning, setImportRunning] = useState(false);
    const [stopRequested, setStopRequested] = useState(false);
    const stopRef = useRef(false);
    const elapsedSeconds = useImportClock(importRunning);

    const runImport = async (rowsToImport: Record<string, string>[], ignoreDuplicates: boolean) => {
        stopRef.current = false;
        setStopRequested(false);
        setDuplicateImportData(null);
        setImportRows(rowsToImport);
        setImportJobs(rowsToImport.map(r => ({
            name: rowName(r),
            status: 'pending',
            warnings: [],
        })));
        setImportRunning(true);

        let added = 0;
        for (let i = 0; i < rowsToImport.length; i++) {
            if (stopRef.current) break;
            const update = (patch: Partial<ImportJob> | ((job: ImportJob) => Partial<ImportJob>)) =>
                setImportJobs(prev => prev && prev.map((job, idx) =>
                    idx === i ? { ...job, ...(typeof patch === 'function' ? patch(job) : patch) } : job
                ));

            update({ status: 'running' });
            try {
                const row = await prepareImportRow(
                    rowsToImport[i],
                    categoriesOptions?.items?.map(c => c.name),
                    step => update({ step }),
                    msg => update(job => ({ warnings: [...job.warnings, msg] })),
                );
                update({ step: 'save' });
                const result = await ioApi.importRows([row], ignoreDuplicates, true);
                if (result.failed) {
                    update({ status: 'failed', message: (result.errors[0] || 'Failed').replace(/^Row \d+:\s*/, '') });
                } else if (result.success === 0) {
                    update({ status: 'skipped', message: 'Already in the catalog' });
                } else {
                    added += 1;
                    update({ status: 'done' });
                }
            } catch (err: any) {
                if (err.response?.status === 409) {
                    update({ status: 'skipped', message: 'Already in the catalog' });
                } else {
                    update({ status: 'failed', message: errorMessage(err) });
                }
            }
        }

        setImportRunning(false);
        if (added > 0) {
            queryClient.invalidateQueries({ queryKey: ['plants'] });
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            queryClient.invalidateQueries({ queryKey: ['categories'] });
        }
    };

    const handleImport = async () => {
        const nonEmpty = rows.filter(r => r.common_name?.trim() || r.species?.trim());
        if (nonEmpty.length === 0) {
            showAlert('No plants to import. Fill in at least one row.', 'warning');
            return;
        }
        setIsImporting(true);
        try {
            const { duplicates } = await ioApi.findDuplicateRows(nonEmpty);
            if (duplicates.length > 0) {
                setDuplicateImportData({ duplicates, rowsToImport: nonEmpty });
                return;
            }
        } catch (err: any) {
            showAlert('Could not check for duplicates: ' + errorMessage(err), 'error');
            return;
        } finally {
            setIsImporting(false);
        }
        await runImport(nonEmpty, false);
    };

    const editRemainingRows = () => {
        const remaining = importRows.filter((_, i) => {
            const status = importJobs?.[i]?.status;
            return status === 'failed' || status === 'pending';
        });
        setRows(remaining.length > 0 ? remaining : [blankCsvRow()]);
        setImportJobs(null);
    };

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <>
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
                                Upload or paste CSV — you can review and edit every field before importing.
                            </p>
                        </div>

                        {/* Input mode toggle */}
                        <div className="w-full flex flex-col gap-4">
                        <div role="tablist" aria-label="CSV source" className="inline-flex self-center rounded-xl border border-border bg-muted/40 p-1">
                            {([
                                { mode: 'paste', label: 'Paste CSV', Icon: ClipboardPaste },
                                { mode: 'file', label: 'Upload file', Icon: FileUp },
                            ] as const).map(({ mode, label, Icon }) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="tab"
                                    aria-selected={inputMode === mode}
                                    onClick={() => setInputMode(mode)}
                                    disabled={isPreviewing}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                                        inputMode === mode
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    <Icon size={14} /> {label}
                                </button>
                            ))}
                        </div>

                        {inputMode === 'paste' ? (
                            <div className="w-full flex flex-col gap-3">
                                <Textarea
                                    value={pastedCsv}
                                    onChange={e => setPastedCsv(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handlePastePreview();
                                        }
                                    }}
                                    disabled={isPreviewing}
                                    autoFocus
                                    spellCheck={false}
                                    placeholder="Paste CSV here…"
                                    aria-label="CSV text"
                                    className="min-h-[220px] rounded-2xl font-mono text-xs leading-relaxed whitespace-pre overflow-auto"
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs text-muted-foreground">
                                        Header row optional if columns are in the standard order. {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to preview.
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {pastedCsv && (
                                            <Button variant="ghost" size="sm" onClick={() => setPastedCsv('')} disabled={isPreviewing}>
                                                Clear
                                            </Button>
                                        )}
                                        <Button size="sm" onClick={handlePastePreview} disabled={isPreviewing || !pastedCsv.trim()} className="gap-1.5">
                                            {isPreviewing
                                                ? <><Loader2 size={13} className="animate-spin" /> Reading CSV…</>
                                                : <>Preview <ChevronRight size={13} /></>}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
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
                        )}
                        </div>

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
                                    Copy the prompt above and paste it into ChatGPT/Claude along with your list of plants. Then paste the resulting CSV above, or download it and upload the file.
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
                                    {fileName === PASTED_NAME ? 'Edit pasted CSV' : 'Re-upload'}
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
                                    onClick={() => handleImport()}
                                    disabled={isImporting || importRunning || parseErrors.length > 0}
                                    className="flex-1 sm:flex-initial gap-1.5 h-8 text-[11px] font-bold bg-primary hover:bg-primary/90"
                                >
                                    {isImporting ? (
                                        <><Loader2 size={13} className="animate-spin" /> Checking duplicates…</>
                                    ) : (
                                        <><Upload size={13} /> Confirm Import</>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Spreadsheet */}
                        <CsvRowsTable
                            rows={rows}
                            onCellChange={updateCell}
                            onDeleteRow={deleteRow}
                            className="flex-1 min-h-0 max-h-[calc(100vh-18rem)]"
                        />

                        {/* Footer hint */}
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Info size={12} className="text-amber-500 shrink-0" />
                            Blank fields (description, care data, images) will be auto-filled by AI during import.
                            Required fields are marked <span className="text-red-400 font-bold">*</span>.
                        </p>
                    </div>
                )}
                {/* ── Import progress ─────────────────────────────────────────── */}
                {importJobs && (
                    <ImportProgressOverlay
                        jobs={importJobs}
                        running={importRunning}
                        stopRequested={stopRequested}
                        elapsedSeconds={elapsedSeconds}
                        onStop={() => { stopRef.current = true; setStopRequested(true); }}
                        onEditRemaining={editRemainingRows}
                        onDone={() => navigate({ to: '/plants' })}
                    />
                )}

                {/* ── Duplicate Import Dialog ─────────────────────────────────── */}
                <Dialog open={!!duplicateImportData} onOpenChange={(open) => !open && setDuplicateImportData(null)}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                                Duplicate Plants Detected
                            </DialogTitle>
                            <DialogDescription className="pt-2 text-sm text-muted-foreground">
                                We found plants in your import list that already exist in the database catalog.
                            </DialogDescription>
                        </DialogHeader>
                        {duplicateImportData && (
                            <div className="space-y-3">
                                <div className="max-h-60 overflow-y-auto rounded-xl border border-border p-3 divide-y divide-border bg-muted/20">
                                    {duplicateImportData.duplicates.map((dup, i) => (
                                        <div key={i} className="py-2 first:pt-0 last:pb-0 flex flex-col">
                                            <span className="font-medium text-sm text-foreground">
                                                {dup.common_name}
                                            </span>
                                            {dup.scientific_name && (
                                                <span className="text-xs italic text-muted-foreground">
                                                    {dup.scientific_name}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    How would you like to handle these duplicates?
                                </p>
                            </div>
                        )}
                        <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-1.5 justify-end">
                            <Button 
                                variant="outline" 
                                onClick={() => setDuplicateImportData(null)}
                                className="w-full sm:w-auto"
                            >
                                Cancel / Edit
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    if (duplicateImportData) {
                                        const duplicateIndices = duplicateImportData.duplicates.map(d => d.row_index);
                                        const remainingRows = duplicateImportData.rowsToImport.filter((_, idx) => !duplicateIndices.includes(idx));
                                        if (remainingRows.length === 0) {
                                            setDuplicateImportData(null);
                                            showAlert('Every plant in this list is already in the catalog.', 'info');
                                            return;
                                        }
                                        runImport(remainingRows, true);
                                    }
                                }}
                                className="w-full sm:w-auto hover:bg-primary/5 border-primary/20 text-primary hover:text-primary"
                            >
                                Skip Duplicates
                            </Button>
                            <Button
                                variant="destructive"
                                disabled={isImporting}
                                onClick={() => {
                                    if (duplicateImportData) {
                                        runImport(duplicateImportData.rowsToImport, true);
                                    }
                                }}
                                className="w-full sm:w-auto gap-1.5"
                            >
                                {isImporting ? (
                                    <><Loader2 size={13} className="animate-spin" /> Importing…</>
                                ) : (
                                    'Ignore & Import All'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
};
