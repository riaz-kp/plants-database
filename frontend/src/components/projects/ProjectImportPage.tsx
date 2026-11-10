import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertCircle, AlertTriangle, ArrowLeft, Info, Check, CheckCircle2, ChevronDown, CircleDashed, ClipboardList,
    Copy, LayoutList, Leaf, ListChecks, Loader2, Lock, RotateCcw, Sparkles, Table2, Undo2, X,
} from 'lucide-react';

import { projectsApi } from '../../api/projects';
import { ioApi } from '../../api/io';
import { categoriesApi } from '../../api/categories';
import { projectDetailsQueryOptions } from '../../api/queryOptions';
import type { PlantBrief, PlantNameMatch } from '../../types/project';
import { useAlert } from '../../contexts/AlertContext';
import { cn, cloudinaryThumb } from '../../lib-frontend/utils';
import { cleanPastedCsv } from '../plants/csvPaste';
import { ImportProgressOverlay } from '../plants/ImportProgressOverlay';
import { CsvRowsTable } from '../plants/CsvRowsTable';
import {
    buildBulkImportPrompt, DEFAULT_CATEGORY_LIST, errorMessage, prepareImportRow, rowName, useImportClock,
    type ImportJob,
} from '../plants/plantImport';
import { normalizeName, parsePlantList, rowCoversName } from './projectImport';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type Stage = 'list' | 'review';
type CsvDupes = Record<number, { id: string; name: string }>;

/** Duplicate-check results as row index → the catalog plant that row already is */
const toCsvDupes = (duplicates: { row_index: number; common_name: string; existing_plant_id?: string; existing_common_name?: string }[]): CsvDupes =>
    Object.fromEntries(duplicates
        .filter(d => d.existing_plant_id)
        .map(d => [d.row_index, { id: d.existing_plant_id!, name: d.existing_common_name || d.common_name }]));

const CSV_VIEW_KEY = 'projectImportCsvView';
type CsvStatus = 'new' | 'in_catalog' | 'in_project';

const MOD_KEY = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const httpStatus = (err: any): number | undefined => err?.response?.status;

/* ── Small pieces ── */

function PlantThumb({ url }: { url?: string | null }) {
    return (
        <div className="w-9 h-9 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
            {url
                ? <img src={cloudinaryThumb(url, 36)} alt="" loading="lazy" className="w-full h-full object-cover" />
                : <Leaf className="w-4 h-4 text-muted-foreground/40" />}
        </div>
    );
}

function SectionHeader({ icon, title, count, children, description }: {
    icon: ReactNode;
    title: string;
    count?: number;
    children?: ReactNode;
    description?: ReactNode;
}) {
    return (
        <div className="px-4 sm:px-5 py-3.5 border-b border-border">
            <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold text-foreground min-w-0">
                    {icon}
                    <span className="truncate">{title}</span>
                    {count !== undefined && <Badge variant="secondary" className="tabular-nums">{count}</Badge>}
                </h2>
                {children}
            </div>
            {description && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>}
        </div>
    );
}

function CsvStatusChip({ status, existingName }: { status: CsvStatus; existingName?: string }) {
    if (status === 'new') {
        return <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">New</span>;
    }
    if (status === 'in_catalog') {
        return (
            <span
                className="shrink-0 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                title={existingName ? `Already in the catalog as “${existingName}” — that plant is added instead of a copy` : undefined}
            >
                In catalog
            </span>
        );
    }
    return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">In project</span>;
}

/** `note` says which pasted name or CSV row an entry came from, when its name differs */
function ConfirmList({ title, hint, items }: { title: string; hint: string; items: { name: string; note?: string }[] }) {
    return (
        <div>
            <h3 className="text-sm font-semibold text-foreground">
                {title} <span className="font-normal text-muted-foreground tabular-nums">({items.length})</span>
            </h3>
            <p className="text-xs text-muted-foreground mb-2">{hint}</p>
            <ol className="rounded-lg border border-border bg-muted/20 divide-y divide-border/60 text-sm">
                {items.map(({ name, note }, i) => (
                    <li key={i} className="flex gap-2 px-3 py-1.5">
                        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70 pt-0.5">{i + 1}</span>
                        <span className="min-w-0 break-words">
                            {name}
                            {note && <span className="text-xs text-muted-foreground"> · for “{note}”</span>}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/* ── Page ── */

export const ProjectImportPage = () => {
    const { id } = useParams({ strict: false }) as { id: string };
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();

    const { data: project, isLoading } = useQuery({ ...projectDetailsQueryOptions(id), enabled: !!id });
    const { data: categoriesOptions } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });
    const categoryNames = categoriesOptions?.items?.map(c => c.name);
    const categoriesList = categoryNames?.length ? categoryNames.join(', ') : DEFAULT_CATEGORY_LIST;

    const projectPlantIds = useMemo(() => new Set(project?.plants.map(pp => pp.plant_id) ?? []), [project]);

    /* ── Step 1: the pasted list ── */
    const [stage, setStage] = useState<Stage>('list');
    const [listText, setListText] = useState('');
    const [checking, setChecking] = useState(false);
    const parsedNames = useMemo(() => parsePlantList(listText), [listText]);

    /* ── Step 2: what the catalog has ── */
    const [matches, setMatches] = useState<PlantNameMatch[]>([]);
    /** Plant chosen for a name: another exact match, or a suggestion for a missing name */
    const [picked, setPicked] = useState<Record<number, PlantBrief>>({});
    /** Names left out: unticked catalog plants and removed missing names */
    const [excluded, setExcluded] = useState<Set<number>>(new Set());

    /* ── Step 3: CSV for the missing plants ── */
    const [csvText, setCsvText] = useState('');
    const [csvReading, setCsvReading] = useState(false);
    const [csvRows, setCsvRows] = useState<Record<string, string>[] | null>(null);
    const [csvErrors, setCsvErrors] = useState<string[]>([]);
    /** CSV rows that are already in the catalog: row index → that catalog plant */
    const [csvDupes, setCsvDupes] = useState<CsvDupes>({});
    const [csvExcluded, setCsvExcluded] = useState<Set<number>>(new Set());
    const [copied, setCopied] = useState(false);
    /** Short list, or every column editable; remembered per browser */
    const [csvView, setCsvViewState] = useState<'list' | 'table'>(() => {
        try { return localStorage.getItem(CSV_VIEW_KEY) === 'table' ? 'table' : 'list'; } catch { return 'list'; }
    });
    const setCsvView = (view: 'list' | 'table') => {
        setCsvViewState(view);
        try { localStorage.setItem(CSV_VIEW_KEY, view); } catch { /* storage unavailable */ }
    };
    /** Cell edits made, and how many of them the catalog check has seen */
    const [csvEdits, setCsvEdits] = useState(0);
    const [csvCheckedEdits, setCsvCheckedEdits] = useState(0);
    const recheckPending = csvEdits !== csvCheckedEdits && !!csvRows?.length;

    /* ── Step 4: confirm + run ── */
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [jobs, setJobs] = useState<ImportJob[] | null>(null);
    /** The CSV row behind each job (null for plants added from the catalog) */
    const [jobRows, setJobRows] = useState<(Record<string, string> | null)[]>([]);
    const [running, setRunning] = useState(false);
    const [stopRequested, setStopRequested] = useState(false);
    const stopRef = useRef(false);
    const elapsedSeconds = useImportClock(running);

    const toggleIn = <T,>(set: Set<T>, value: T) => {
        const next = new Set(set);
        if (next.has(value)) next.delete(value); else next.add(value);
        return next;
    };

    const updateCsvCell = (rowIdx: number, key: string, value: string) => {
        setCsvRows(prev => prev && prev.map((r, i) => (i === rowIdx ? { ...r, [key]: value } : r)));
        setCsvEdits(n => n + 1);
    };

    // An edited name or species can make a row new, or one the catalog already has: check again
    // a moment after typing stops. The import itself never duplicates a catalog plant either way.
    useEffect(() => {
        if (csvEdits === csvCheckedEdits || !csvRows?.length) return;
        const rows = csvRows;
        const edits = csvEdits;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const { duplicates } = await ioApi.findDuplicateRows(rows);
                if (!cancelled) setCsvDupes(toCsvDupes(duplicates));
            } catch {
                /* keep the last statuses */
            }
            if (!cancelled) setCsvCheckedEdits(edits);
        }, 700);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [csvEdits, csvCheckedEdits, csvRows]);

    /* ── Derived: each name resolved against the catalog and the project ── */
    const resolved = useMemo(() => {
        const firstForPlant = new Map<string, number>();
        return matches.map((m, index) => {
            const plant = picked[index] ?? m.plant ?? null;
            const status: PlantNameMatch['status'] = !plant ? 'missing' : projectPlantIds.has(plant.id) ? 'in_project' : 'found';
            // Two names for one plant ('Areca Palm' and 'Dypsis lutescens') add it once
            let sameAs: number | undefined;
            if (plant && status === 'found' && !excluded.has(index)) {
                sameAs = firstForPlant.get(plant.id);
                if (sameAs === undefined) firstForPlant.set(plant.id, index);
            }
            return {
                index,
                match: m,
                name: m.name,
                plant,
                status,
                sameAs,
                options: m.plant ? [m.plant, ...m.alternatives] : [],
                fromSuggestion: !m.plant && !!picked[index],
            };
        });
    }, [matches, picked, excluded, projectPlantIds]);

    const found = resolved.filter(r => r.status === 'found');
    const inProject = resolved.filter(r => r.status === 'in_project');
    const missing = resolved.filter(r => r.status === 'missing' && !excluded.has(r.index));
    const removedMissing = resolved.filter(r => r.status === 'missing' && excluded.has(r.index));
    const selectedFound = found.filter(r => !excluded.has(r.index) && r.sameAs === undefined);
    const allFoundSelected = found.length > 0 && found.every(r => !excluded.has(r.index));

    const csvItems = useMemo(() => (csvRows ?? []).map((row, i) => {
        const dup = csvDupes[i];
        const status: CsvStatus = dup ? (projectPlantIds.has(dup.id) ? 'in_project' : 'in_catalog') : 'new';
        return { i, row, dup, status, selected: status !== 'in_project' && !csvExcluded.has(i) };
    }), [csvRows, csvDupes, csvExcluded, projectPlantIds]);

    /** What the import will do */
    const plan = useMemo(() => {
        // plant id → its name, plus the pasted name / CSV row it came from when that differs
        const catalog = new Map<string, { name: string; note?: string }>();
        const note = (name: string, from: string) => (normalizeName(name) !== normalizeName(from) ? from : undefined);
        for (const r of selectedFound) catalog.set(r.plant!.id, { name: r.plant!.common_name, note: note(r.plant!.common_name, r.name) });
        for (const c of csvItems) {
            if (c.selected && c.status === 'in_catalog' && !catalog.has(c.dup!.id)) {
                catalog.set(c.dup!.id, { name: c.dup!.name, note: note(c.dup!.name, rowName(c.row)) });
            }
        }
        return {
            catalog: [...catalog].map(([plantId, entry]) => ({ id: plantId, ...entry })),
            newRows: csvItems.filter(c => c.selected && c.status === 'new').map(c => c.row),
        };
    }, [selectedFound, csvItems]);
    const total = plan.catalog.length + plan.newRows.length;

    /** Missing names no ticked CSV row seems to cover */
    const uncovered = missing.filter(r => !csvItems.some(c => c.selected && rowCoversName(c.row, r.name)));

    const prompt = buildBulkImportPrompt(categoriesList, missing.map(r => r.name));

    /* ── Handlers ── */
    const handleCheck = useCallback(async () => {
        if (!parsedNames.length) {
            showAlert('Paste at least one plant name.', 'error');
            return;
        }
        setChecking(true);
        try {
            const results = await projectsApi.matchPlantNames(id, parsedNames);
            setMatches(results);
            setPicked({});
            setExcluded(new Set());
            setStage('review');
        } catch (err) {
            showAlert('Could not check the list: ' + errorMessage(err), 'error');
        } finally {
            setChecking(false);
        }
    }, [id, parsedNames, showAlert]);

    const skipToCsv = () => {
        setMatches([]);
        setPicked({});
        setExcluded(new Set());
        setStage('review');
    };

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            showAlert('Could not copy — select the prompt text and copy it instead.', 'error');
        }
    };

    const handleReadCsv = useCallback(async () => {
        const { text, lostLineBreaks } = cleanPastedCsv(csvText);
        if (!text) {
            showAlert('Paste some CSV text first.', 'error');
            return;
        }
        if (lostLineBreaks) {
            showAlert(
                'The pasted CSV is on one line, so its rows could not be separated. '
                + 'Copy it again using the copy button on the code block.',
                'error',
            );
            return;
        }
        setCsvReading(true);
        try {
            const preview = await ioApi.previewCsv(new File([text], 'pasted.csv', { type: 'text/csv' }));
            const rows = preview.rows.filter(r => r.common_name?.trim() || r.species?.trim());
            const dupes = rows.length ? toCsvDupes((await ioApi.findDuplicateRows(rows)).duplicates) : {};
            setCsvErrors(preview.errors);
            setCsvRows(rows);
            setCsvDupes(dupes);
            setCsvExcluded(new Set());
            setCsvEdits(0);
            setCsvCheckedEdits(0);
            if (!rows.length && !preview.errors.length) showAlert('No plant rows found in the CSV.', 'error');
        } catch (err) {
            showAlert('Could not read the CSV: ' + errorMessage(err), 'error');
        } finally {
            setCsvReading(false);
        }
    }, [csvText, showAlert]);

    const clearCsv = () => {
        setCsvText('');
        setCsvRows(null);
        setCsvErrors([]);
        setCsvDupes({});
        setCsvExcluded(new Set());
        setCsvEdits(0);
        setCsvCheckedEdits(0);
    };

    const runImport = async () => {
        setConfirmOpen(false);
        const { catalog, newRows } = plan;
        stopRef.current = false;
        setStopRequested(false);
        setJobRows([...catalog.map(() => null), ...newRows]);
        setJobs([
            ...catalog.map(p => ({ name: p.name, status: 'pending' as const, warnings: [] })),
            ...newRows.map(r => ({ name: rowName(r), status: 'pending' as const, warnings: [] })),
        ]);
        setRunning(true);

        const update = (i: number, patch: Partial<ImportJob> | ((job: ImportJob) => Partial<ImportJob>)) =>
            setJobs(prev => prev && prev.map((job, idx) =>
                idx === i ? { ...job, ...(typeof patch === 'function' ? patch(job) : patch) } : job
            ));

        let addedAny = false;
        let createdAny = false;

        // Catalog plants: one request for all of them
        if (catalog.length) {
            catalog.forEach((_, i) => update(i, { status: 'running', step: 'save' }));
            try {
                await projectsApi.addPlantsBulk(id, catalog.map(p => p.id));
                catalog.forEach((_, i) => update(i, { status: 'done', message: 'Added from the catalog' }));
                addedAny = true;
            } catch (err) {
                const message = errorMessage(err);
                catalog.forEach((_, i) => update(i, { status: 'failed', message }));
                if (httpStatus(err) === 423) stopRef.current = true; // locked meanwhile
            }
        }

        // New plants: AI details + images, then one request each, so progress is real
        for (let k = 0; k < newRows.length; k++) {
            if (stopRef.current) break;
            const i = catalog.length + k;
            update(i, { status: 'running' });
            try {
                const row = await prepareImportRow(
                    newRows[k],
                    categoryNames,
                    step => update(i, { step }),
                    msg => update(i, job => ({ warnings: [...job.warnings, msg] })),
                );
                update(i, { step: 'save' });
                const result = await projectsApi.importRows(id, [row], true);
                const outcome = result.rows[0];
                if (outcome?.status === 'created') {
                    addedAny = createdAny = true;
                    update(i, { status: 'done', message: 'New in the catalog · added to the project' });
                } else if (outcome?.status === 'linked') {
                    addedAny = true;
                    update(i, { status: 'done', message: 'Already in the catalog · added to the project' });
                } else if (outcome?.status === 'already_in_project') {
                    update(i, { status: 'skipped', message: 'Already in this project' });
                } else {
                    update(i, { status: 'failed', message: outcome?.error || result.errors[0] || 'Failed' });
                }
            } catch (err) {
                update(i, { status: 'failed', message: errorMessage(err) });
                if (httpStatus(err) === 423) break;
            }
        }

        setRunning(false);
        if (addedAny) {
            queryClient.invalidateQueries({ queryKey: ['project', id] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        }
        if (createdAny) {
            queryClient.invalidateQueries({ queryKey: ['plants'] });
            queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            queryClient.invalidateQueries({ queryKey: ['categories'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }
    };

    /** Back to the review with only the CSV rows that didn't make it */
    const editRemaining = () => {
        const remaining = jobRows.filter((row, i) => row && (jobs?.[i]?.status === 'failed' || jobs?.[i]?.status === 'pending'));
        setCsvRows(remaining.length ? (remaining as Record<string, string>[]) : null);
        setCsvDupes({});
        setCsvExcluded(new Set());
        setCsvEdits(0);
        setCsvCheckedEdits(0);
        setJobs(null);
    };

    /* ── Loading / locked ── */
    if (isLoading) return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full rounded-xl" />
        </div>
    );
    if (!project) return (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p className="text-sm">Project not found.</p>
            <Button asChild variant="link" className="mt-2"><Link to="/projects">← Back to Projects</Link></Button>
        </div>
    );

    const backToProject = (
        <Button asChild variant="outline" size="sm">
            <Link to="/projects/$id" params={{ id }}><ArrowLeft className="w-4 h-4 mr-2" />Back to project</Link>
        </Button>
    );

    const header = (
        <>
            <div className="mb-6">{backToProject}</div>
            <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bulk import</p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight break-words">{project.name}</h1>
            </div>
        </>
    );

    if (project.is_locked && !jobs) return (
        <div className="max-w-4xl mx-auto">
            {header}
            <div className="rounded-xl border border-border bg-white shadow-sm p-8 flex flex-col items-center text-center gap-2">
                <Lock className="w-6 h-6 text-muted-foreground" />
                <p className="font-medium text-foreground">This project is locked</p>
                <p className="text-sm text-muted-foreground">Unlock it on the project page to import plants into it.</p>
            </div>
        </div>
    );

    const csvSection = (
        <section className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <SectionHeader
                icon={<Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />}
                title={missing.length ? 'Add the missing plants' : 'Add new plants from a CSV'}
                description={missing.length
                    ? <>Copy the prompt — it already lists the {missing.length} missing {missing.length === 1 ? 'plant' : 'plants'} — into ChatGPT or Claude, then paste the CSV it gives back. The plants are created in the catalog and added to this project.</>
                    : <>Paste CSV for plants that aren't in the catalog yet. They're created in the catalog and added to this project. Use the prompt below to have an AI write it.</>}
            />
            <div className="p-4 sm:p-5 space-y-5">
                {/* 1. Prompt */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                            <span className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded-full bg-primary/10 text-primary text-[11px] font-bold">1</span>
                            Copy the AI prompt
                        </p>
                        <Button variant="outline" size="sm" onClick={handleCopyPrompt} className="h-8 gap-1.5 text-xs">
                            {copied ? <><Check size={13} className="text-emerald-600" /> Copied</> : <><Copy size={13} /> Copy prompt</>}
                        </Button>
                    </div>
                    <details className="group rounded-lg border border-border bg-muted/30">
                        <summary className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                            <ChevronDown className="w-3.5 h-3.5 transition-transform -rotate-90 group-open:rotate-0" />
                            Show prompt
                            {missing.length === 0 && <span className="text-muted-foreground/70">— add your plant names where it says to</span>}
                        </summary>
                        <pre className="px-3 pb-3 text-[11px] text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed font-mono max-h-[220px] overflow-y-auto">{prompt}</pre>
                    </details>
                </div>

                {/* 2. CSV */}
                <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded-full bg-primary/10 text-primary text-[11px] font-bold">2</span>
                        Paste the CSV it returns
                    </p>
                    <Textarea
                        value={csvText}
                        onChange={e => setCsvText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                handleReadCsv();
                            }
                        }}
                        disabled={csvReading}
                        spellCheck={false}
                        placeholder="kingdom,division,class,order,family,genus,species,common_name,…"
                        aria-label="CSV text"
                        className="min-h-[140px] rounded-lg font-mono text-xs leading-relaxed whitespace-pre overflow-auto"
                    />
                    <div className="flex items-center justify-end gap-2">
                        {(csvText || csvRows) && (
                            <Button variant="ghost" size="sm" onClick={clearCsv} disabled={csvReading}>Clear</Button>
                        )}
                        <Button size="sm" variant={csvRows ? 'outline' : 'default'} onClick={handleReadCsv} disabled={csvReading || !csvText.trim()} className="gap-1.5">
                            {csvReading
                                ? <><Loader2 size={13} className="animate-spin" /> Reading CSV…</>
                                : csvRows ? <><RotateCcw size={13} /> Read again</> : 'Read CSV'}
                        </Button>
                    </div>
                </div>

                {csvErrors.length > 0 && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                        <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-700">{csvErrors.map((e, i) => <p key={i}>{e}</p>)}</div>
                    </div>
                )}

                {/* CSV rows */}
                {csvRows && csvRows.length > 0 && (
                    <div className={cn(csvView === 'list' && 'rounded-lg border border-border overflow-hidden')}>
                        <div className={cn(
                            'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground',
                            csvView === 'list' ? 'px-4 py-2 bg-muted/30 border-b border-border' : 'mb-2',
                        )}>
                            <span className="flex items-center gap-1.5">
                                {csvRows.length} {csvRows.length === 1 ? 'row' : 'rows'} ·{' '}
                                {csvItems.filter(c => c.selected && c.status === 'new').length} new
                                {csvItems.some(c => c.status === 'in_catalog') && ` · ${csvItems.filter(c => c.selected && c.status === 'in_catalog').length} already in catalog`}
                                {recheckPending && <span className="inline-flex items-center gap-1 text-primary"><Loader2 size={11} className="animate-spin" /> checking edits</span>}
                            </span>
                            <div role="tablist" aria-label="CSV rows view" className="inline-flex rounded-md border border-border bg-background p-0.5">
                                {([
                                    { view: 'list', label: 'List', Icon: LayoutList },
                                    { view: 'table', label: 'All columns', Icon: Table2 },
                                ] as const).map(({ view, label, Icon }) => (
                                    <button
                                        key={view}
                                        type="button"
                                        role="tab"
                                        aria-selected={csvView === view}
                                        onClick={() => setCsvView(view)}
                                        className={cn(
                                            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                                            csvView === view ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <Icon size={13} /> {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {csvView === 'list' ? (
                            <ul className="divide-y divide-border/70">
                                {csvItems.map(c => {
                                    const sci = c.row.scientific_name?.trim() || [c.row.genus, c.row.species].filter(Boolean).join(' ');
                                    return (
                                        <li key={c.i} className={cn('flex items-center gap-3 px-4 py-2.5', !c.selected && 'opacity-60')}>
                                            <input
                                                type="checkbox"
                                                checked={c.selected}
                                                disabled={c.status === 'in_project'}
                                                onChange={() => setCsvExcluded(s => toggleIn(s, c.i))}
                                                aria-label={`Import ${rowName(c.row)}`}
                                                className="w-4 h-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground truncate">{rowName(c.row) || `Row ${c.i + 1}`}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {sci && <i>{sci}</i>}
                                                    {c.row.category && <>{sci && ' · '}{c.row.category}</>}
                                                    {c.status !== 'new' && c.dup && normalizeName(c.dup.name) !== normalizeName(rowName(c.row)) && (
                                                        <> · uses catalog plant “{c.dup.name}”</>
                                                    )}
                                                </p>
                                            </div>
                                            <CsvStatusChip status={c.status} existingName={c.dup?.name} />
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <>
                                <CsvRowsTable
                                    rows={csvRows}
                                    onCellChange={updateCsvCell}
                                    className="max-h-[70vh]"
                                    // Fade the contents, not the cells: a see-through sticky name column would show what scrolls under it
                                    rowClassName={i => (csvItems[i]?.selected ? undefined : '[&_textarea]:opacity-50 [&_img]:opacity-50')}
                                    lead={{
                                        header: 'Import',
                                        width: 104,
                                        render: i => {
                                            const c = csvItems[i];
                                            if (!c) return null;
                                            return (
                                                <div className="flex flex-col items-start gap-1.5 px-1">
                                                    <label className="flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={c.selected}
                                                            disabled={c.status === 'in_project'}
                                                            onChange={() => setCsvExcluded(s => toggleIn(s, i))}
                                                            aria-label={`Import ${rowName(c.row) || `row ${i + 1}`}`}
                                                            className="w-4 h-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                                                        />
                                                        {i + 1}
                                                    </label>
                                                    <CsvStatusChip status={c.status} existingName={c.dup?.name} />
                                                </div>
                                            );
                                        },
                                    }}
                                />
                                <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
                                    <Info size={12} className="text-amber-500 shrink-0 mt-0.5" />
                                    <span>
                                        Edit any cell before importing. Blank description, care and image cells are filled in by AI during the import.
                                        Required columns are marked <span className="text-red-400 font-bold">*</span>.
                                    </span>
                                </p>
                            </>
                        )}
                    </div>
                )}

                {csvRows && uncovered.length > 0 && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                            The CSV doesn't seem to include {uncovered.length === 1 ? 'this name' : 'these names'} from your list:{' '}
                            <span className="font-medium">{uncovered.map(r => r.name).join(', ')}</span>. They won't be imported unless you add them to the CSV.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );

    return (
        <div className={cn('max-w-4xl mx-auto', stage === 'review' && 'pb-28')}>
            {header}

            {/* ══ Step 1: paste the list ══ */}
            {stage === 'list' && (
                <div className="space-y-4">
                    <section className="rounded-xl border border-border bg-white shadow-sm p-5 sm:p-6 space-y-4">
                        <div>
                            <h2 className="font-semibold text-foreground flex items-center gap-2">
                                <ClipboardList className="w-4 h-4 text-primary" /> Paste your plant list
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                One plant per line — common or scientific names. Numbering and bullets are ignored, and rows copied from a spreadsheet work too.
                                You'll see which plants are already in the catalog before anything is added.
                            </p>
                        </div>
                        <Textarea
                            value={listText}
                            onChange={e => setListText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleCheck();
                                }
                            }}
                            disabled={checking}
                            autoFocus
                            placeholder={'Areca Palm\nBougainvillea\nDypsis lutescens\nNeem Tree\n…'}
                            aria-label="Plant names"
                            className="min-h-[240px] rounded-lg text-sm leading-relaxed"
                        />
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-xs text-muted-foreground">
                                {parsedNames.length} {parsedNames.length === 1 ? 'name' : 'names'}
                                <span className="hidden sm:inline"> · {MOD_KEY}+Enter to check</span>
                            </span>
                            <div className="flex items-center gap-2 justify-end">
                                {listText && (
                                    <Button variant="ghost" size="sm" onClick={() => setListText('')} disabled={checking}>Clear</Button>
                                )}
                                <Button size="sm" onClick={handleCheck} disabled={checking || parsedNames.length === 0} className="gap-1.5">
                                    {checking
                                        ? <><Loader2 size={13} className="animate-spin" /> Checking…</>
                                        : <><ListChecks size={14} /> Check list</>}
                                </Button>
                            </div>
                        </div>
                    </section>
                    <p className="text-center text-sm text-muted-foreground">
                        Already have a CSV from the AI prompt?{' '}
                        <button type="button" onClick={skipToCsv} className="text-primary font-medium hover:underline">Paste it directly</button>
                    </p>
                </div>
            )}

            {/* ══ Step 2–3: review + CSV ══ */}
            {stage === 'review' && (
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                        {matches.length > 0 ? (
                            <>
                                <span className="text-muted-foreground">{matches.length} {matches.length === 1 ? 'name' : 'names'} checked:</span>
                                <span className="inline-flex items-center gap-1.5 text-foreground">
                                    <CheckCircle2 className="w-4 h-4 text-primary" /> {found.length} in catalog
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-foreground">
                                    <Leaf className="w-4 h-4 text-muted-foreground" /> {inProject.length} already in project
                                </span>
                                <span className="inline-flex items-center gap-1.5 text-foreground">
                                    <CircleDashed className="w-4 h-4 text-amber-500" /> {missing.length} not in catalog
                                </span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">Importing from a CSV only.</span>
                        )}
                        <button type="button" onClick={() => setStage('list')} className="text-primary text-sm font-medium hover:underline">
                            {matches.length ? 'Edit list' : 'Paste a plant list instead'}
                        </button>
                    </div>

                    {/* In the catalog */}
                    {found.length > 0 && (
                        <section className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                            <SectionHeader
                                icon={<CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                                title="In the catalog"
                                count={found.length}
                                description="These are added to the project. Untick any you don't want."
                            >
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={allFoundSelected}
                                        onChange={() => setExcluded(prev => {
                                            const next = new Set(prev);
                                            for (const r of found) {
                                                if (allFoundSelected) next.add(r.index); else next.delete(r.index);
                                            }
                                            return next;
                                        })}
                                        className="w-4 h-4 cursor-pointer accent-primary"
                                    />
                                    All
                                </label>
                            </SectionHeader>
                            <ul className="divide-y divide-border/70">
                                {found.map(r => {
                                    const plant = r.plant!;
                                    const isExcluded = excluded.has(r.index);
                                    const showTyped = normalizeName(r.name) !== normalizeName(plant.common_name);
                                    return (
                                        <li key={r.index} className={cn('flex items-center gap-3 px-4 sm:px-5 py-2.5', (isExcluded || r.sameAs !== undefined) && 'opacity-60')}>
                                            <input
                                                type="checkbox"
                                                checked={!isExcluded}
                                                onChange={() => setExcluded(s => toggleIn(s, r.index))}
                                                aria-label={`Add ${plant.common_name}`}
                                                className="w-4 h-4 shrink-0 cursor-pointer accent-primary"
                                            />
                                            <PlantThumb url={plant.icon_url} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground truncate">{plant.common_name}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {plant.scientific_name && <i>{plant.scientific_name}</i>}
                                                    {showTyped && <>{plant.scientific_name && ' · '}for “{r.name}”</>}
                                                </p>
                                                {r.sameAs !== undefined && (
                                                    <p className="text-[11px] text-muted-foreground">Same plant as “{matches[r.sameAs].name}” — added once</p>
                                                )}
                                                {r.fromSuggestion && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPicked(p => {
                                                            const next = { ...p };
                                                            delete next[r.index];
                                                            return next;
                                                        })}
                                                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                                    >
                                                        <Undo2 className="w-3 h-3" /> Not the right plant
                                                    </button>
                                                )}
                                            </div>
                                            {r.options.length > 1 && (
                                                <select
                                                    value={plant.id}
                                                    onChange={e => {
                                                        const choice = r.options.find(o => o.id === e.target.value);
                                                        if (choice) setPicked(p => ({ ...p, [r.index]: choice }));
                                                    }}
                                                    aria-label={`Which “${r.name}”`}
                                                    title={`${r.options.length} catalog plants match “${r.name}”`}
                                                    className="h-8 max-w-[44%] sm:max-w-[220px] shrink rounded-md border border-input bg-background px-2 text-xs"
                                                >
                                                    {r.options.map(o => (
                                                        <option key={o.id} value={o.id}>
                                                            {o.common_name}{o.scientific_name ? ` — ${o.scientific_name}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            {plant.category && r.options.length <= 1 && (
                                                <span className="hidden sm:inline shrink-0 text-xs text-muted-foreground">{plant.category}</span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* Not in the catalog */}
                    {(missing.length > 0 || removedMissing.length > 0) && (
                        <section className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
                            <SectionHeader
                                icon={<CircleDashed className="w-4 h-4 text-amber-500 shrink-0" />}
                                title="Not in the catalog"
                                count={missing.length}
                                description="Pick a close match if one is the same plant, or add the rest with a CSV below."
                            >
                                {removedMissing.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setExcluded(prev => {
                                            const next = new Set(prev);
                                            removedMissing.forEach(r => next.delete(r.index));
                                            return next;
                                        })}
                                        className="shrink-0 text-xs text-primary hover:underline"
                                    >
                                        Restore {removedMissing.length} removed
                                    </button>
                                )}
                            </SectionHeader>
                            {missing.length > 0 && (
                                <ul className="divide-y divide-border/70">
                                    {missing.map(r => {
                                        const covered = csvRows ? !uncovered.includes(r) : null;
                                        return (
                                            <li key={r.index} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-foreground break-words">
                                                        {r.name}
                                                        {covered === true && (
                                                            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-normal text-emerald-700">
                                                                <Check className="w-3 h-3" /> in the CSV
                                                            </span>
                                                        )}
                                                    </p>
                                                    {r.match.suggestions.length > 0 && (
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                            <span className="text-[11px] text-muted-foreground">Did you mean</span>
                                                            {r.match.suggestions.map((s, _i, all) => (
                                                                <button
                                                                    key={s.id}
                                                                    type="button"
                                                                    onClick={() => setPicked(p => ({ ...p, [r.index]: s }))}
                                                                    title={s.in_project ? 'Already in this project' : `Use ${s.common_name} from the catalog`}
                                                                    className="inline-flex items-center gap-1 max-w-full rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                                                                >
                                                                    <span className="truncate">{s.common_name}</span>
                                                                    {s.scientific_name && (
                                                                        // Phones show it only to tell apart two plants with one name
                                                                        <i className={cn('text-muted-foreground truncate', all.filter(o => o.common_name === s.common_name).length < 2 && 'hidden sm:inline')}>
                                                                            {s.scientific_name}
                                                                        </i>
                                                                    )}
                                                                    {s.in_project && <span className="text-[10px] text-muted-foreground">(in project)</span>}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setExcluded(s => toggleIn(s, r.index))}
                                                    aria-label={`Remove ${r.name} from the list`}
                                                    title="Remove from the list"
                                                    className="p-1 -m-1 shrink-0 rounded text-muted-foreground/60 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>
                    )}

                    {/* CSV for the missing ones (or any new plants) */}
                    {csvSection}

                    {/* Already in this project */}
                    {inProject.length > 0 && (
                        <details className="group rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                            <summary className="flex items-center gap-2 px-4 sm:px-5 py-3.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" />
                                <span className="font-semibold text-foreground">Already in this project</span>
                                <Badge variant="secondary" className="tabular-nums">{inProject.length}</Badge>
                                <span className="hidden sm:inline text-xs text-muted-foreground ml-auto">Left as they are</span>
                            </summary>
                            <ul className="divide-y divide-border/70 border-t border-border">
                                {inProject.map(r => (
                                    <li key={r.index} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                                        <PlantThumb url={r.plant!.icon_url} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-foreground truncate">{r.plant!.common_name}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {r.plant!.scientific_name && <i>{r.plant!.scientific_name}</i>}
                                                {normalizeName(r.name) !== normalizeName(r.plant!.common_name) && <>{r.plant!.scientific_name && ' · '}for “{r.name}”</>}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}

            {/* Action bar */}
            {stage === 'review' && (
                <div className="fixed inset-x-0 bottom-0 z-40 lg:left-60 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 text-sm">
                            {total > 0 ? (
                                <>
                                    <p className="font-medium text-foreground">Add {total} {total === 1 ? 'plant' : 'plants'} to the project</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {plan.catalog.length} from the catalog
                                        {plan.newRows.length > 0 && ` · ${plan.newRows.length} new to the catalog`}
                                    </p>
                                </>
                            ) : (
                                <p className="text-muted-foreground">Nothing selected to add yet</p>
                            )}
                        </div>
                        <Button onClick={() => setConfirmOpen(true)} disabled={total === 0 || running || recheckPending} className="shrink-0">
                            {recheckPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking edits…</> : <>Review &amp; import</>}
                        </Button>
                    </div>
                </div>
            )}

            {/* Confirmation */}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Import {total} {total === 1 ? 'plant' : 'plants'}?</DialogTitle>
                        <DialogDescription>
                            Into <span className="font-medium text-foreground">{project.name}</span>. Plants already in the project are left as they are.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[55vh] overflow-y-auto -mx-1 px-1">
                        {plan.catalog.length > 0 && (
                            <ConfirmList title="From the catalog" hint="Added to the project." items={plan.catalog} />
                        )}
                        {plan.newRows.length > 0 && (
                            <ConfirmList
                                title="New to the catalog"
                                hint="Created in the catalog, then added to the project. Blank details are written by AI and images are found, so each takes a little while."
                                items={plan.newRows.map(r => ({ name: rowName(r) }))}
                            />
                        )}
                        {uncovered.length > 0 && (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-800 leading-relaxed">
                                    <span className="font-medium">Not imported</span> — not in the catalog{csvRows ? ' or the CSV' : ''}: {uncovered.map(r => r.name).join(', ')}
                                </p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>Back</Button>
                        <Button onClick={runImport} disabled={total === 0 || recheckPending}>
                            Import {total} {total === 1 ? 'plant' : 'plants'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Progress */}
            {jobs && (
                <ImportProgressOverlay
                    jobs={jobs}
                    running={running}
                    stopRequested={stopRequested}
                    elapsedSeconds={elapsedSeconds}
                    onStop={() => { stopRef.current = true; setStopRequested(true); }}
                    onEditRemaining={editRemaining}
                    onDone={() => navigate({ to: '/projects/$id', params: { id } })}
                    finishLabel="Back to project"
                    doneLabel="Added to the project"
                />
            )}
        </div>
    );
};
