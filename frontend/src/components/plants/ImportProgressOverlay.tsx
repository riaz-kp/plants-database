import { useEffect, useRef } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Circle, MinusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib-frontend/utils';
import { IMPORT_STEPS, STEP_ORDER, type ImportJob } from './plantImport';

/** Full-screen progress for a step-by-step plant import, one line per plant. */
export const ImportProgressOverlay = ({
    jobs,
    running,
    stopRequested,
    elapsedSeconds,
    onStop,
    onEditRemaining,
    onDone,
    finishLabel = 'Go to catalog',
    doneLabel = 'Added to catalog',
}: {
    jobs: ImportJob[];
    running: boolean;
    stopRequested: boolean;
    elapsedSeconds: number;
    onStop: () => void;
    onEditRemaining: () => void;
    onDone: () => void;
    /** The button that closes a finished import */
    finishLabel?: string;
    /** Shown under a finished plant that has no message of its own */
    doneLabel?: string;
}) => {
    const total = jobs.length;
    const finished = jobs.filter(j => j.status === 'done' || j.status === 'skipped' || j.status === 'failed').length;
    const current = jobs.find(j => j.status === 'running');
    const stepFraction = current?.step ? STEP_ORDER.indexOf(current.step) / STEP_ORDER.length : 0;
    const percent = total ? Math.round(((finished + stepFraction) / total) * 100) : 0;
    const counts = {
        done: jobs.filter(j => j.status === 'done').length,
        skipped: jobs.filter(j => j.status === 'skipped').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        pending: jobs.filter(j => j.status === 'pending').length,
    };
    const listRef = useRef<HTMLDivElement>(null);
    const currentIdx = jobs.findIndex(j => j.status === 'running');

    // Keep the plant being processed in view
    useEffect(() => {
        if (currentIdx < 0) return;
        listRef.current?.querySelector(`[data-job="${currentIdx}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [currentIdx]);

    const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="import-progress-title">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header + bar */}
                <div className="px-5 pt-5 pb-4 border-b border-border space-y-3">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 id="import-progress-title" className="text-base font-semibold text-foreground">
                            {running ? 'Importing plants…' : stopRequested && counts.pending ? 'Import stopped' : 'Import finished'}
                        </h2>
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                            {finished} / {total}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">{elapsed}</span>
                        </span>
                    </div>
                    <div
                        className="h-2.5 w-full rounded-full bg-muted overflow-hidden"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                    >
                        <div
                            className={cn('h-full rounded-full transition-[width] duration-500', counts.failed ? 'bg-amber-500' : 'bg-primary')}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground min-h-[1rem]" aria-live="polite">
                        {current ? (
                            <>
                                <span className="font-semibold text-foreground">{current.name}</span>
                                {' — '}{current.step ? IMPORT_STEPS[current.step] : 'Starting'}…
                            </>
                        ) : running ? 'Preparing…' : (
                            <>
                                {counts.done} added
                                {counts.skipped > 0 && ` · ${counts.skipped} skipped`}
                                {counts.failed > 0 && ` · ${counts.failed} failed`}
                                {counts.pending > 0 && ` · ${counts.pending} not imported`}
                            </>
                        )}
                    </p>
                </div>

                {/* Per-plant list */}
                <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-border/60">
                    {jobs.map((job, i) => (
                        <div key={i} data-job={i} className={cn('flex items-start gap-3 px-5 py-2.5', job.status === 'running' && 'bg-primary/5')}>
                            <div className="mt-0.5 shrink-0">
                                {job.status === 'running' && <Loader2 size={15} className="animate-spin text-primary" />}
                                {job.status === 'done' && (job.warnings.length
                                    ? <AlertTriangle size={15} className="text-amber-500" />
                                    : <CheckCircle2 size={15} className="text-emerald-600" />)}
                                {job.status === 'skipped' && <MinusCircle size={15} className="text-muted-foreground" />}
                                {job.status === 'failed' && <XCircle size={15} className="text-red-500" />}
                                {job.status === 'pending' && <Circle size={15} className="text-muted-foreground/30" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={cn('text-sm truncate', job.status === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                                    {job.name || `Row ${i + 1}`}
                                </p>
                                <p className={cn('text-[11px] leading-snug', job.status === 'failed' ? 'text-red-600' : 'text-muted-foreground')}>
                                    {job.status === 'running' && (job.step ? IMPORT_STEPS[job.step] : 'Starting')}
                                    {job.status === 'pending' && (stopRequested && !running ? 'Not imported (stopped)' : 'Waiting')}
                                    {job.status === 'done' && (job.message || doneLabel)}
                                    {job.status === 'skipped' && (job.message || 'Skipped')}
                                    {job.status === 'failed' && (job.message || 'Failed')}
                                    {job.warnings.length > 0 && ` · ${job.warnings.join(' · ')}`}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-border bg-muted/20 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                    {running ? (
                        <>
                            <p className="text-[11px] text-muted-foreground">
                                Keep this tab open. Plants are saved one by one as they finish.
                            </p>
                            <Button variant="outline" size="sm" onClick={onStop} disabled={stopRequested} className="h-8 text-xs">
                                {stopRequested ? 'Stopping after this plant…' : 'Stop after this plant'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <span />
                            <div className="flex gap-2">
                                {(counts.failed > 0 || counts.pending > 0) && (
                                    <Button variant="outline" size="sm" onClick={onEditRemaining} className="h-8 text-xs">
                                        Edit {counts.failed + counts.pending} remaining row(s)
                                    </Button>
                                )}
                                <Button size="sm" onClick={onDone} className="h-8 text-xs">
                                    {finishLabel}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
