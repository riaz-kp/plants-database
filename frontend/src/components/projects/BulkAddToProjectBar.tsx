import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FolderPlus, Loader2, Lock, X } from 'lucide-react';

import { projectsApi } from '../../api/projects';
import { projectsQueryOptions } from '../../api/queryOptions';
import { useAlert } from '../../contexts/AlertContext';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** localStorage key of the project plants were last added to (the default target). */
export const LAST_PROJECT_KEY = 'lastProjectId';

interface BulkAddToProjectBarProps {
    plantIds: string[];
    onClear: () => void;
    /** Runs after the plants were added; clearing the selection is up to the caller */
    onAdded?: (projectId: string) => void;
    /** Left out of the target list, e.g. the project the plants were picked from */
    excludeProjectId?: string;
}

/** Floating bar for adding the selected plants to a project. */
export function BulkAddToProjectBar({ plantIds, onClear, onAdded, excludeProjectId }: BulkAddToProjectBarProps) {
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();

    const { data: projectsData, isLoading } = useQuery(projectsQueryOptions());
    const projectOptions = (projectsData?.items ?? []).filter(p => p.id !== excludeProjectId);

    // Default target: the project plants were last added to, else the most recently updated one
    const [lastProjectId, setLastProjectId] = useState<string | null>(() => {
        try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
    });
    const defaultProject = projectOptions.find(p => p.id === lastProjectId && !p.is_locked)
        ?? projectOptions.find(p => !p.is_locked);
    // Picking from the dropdown only changes the target; adding is a separate click
    const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
    const targetProject = projectOptions.find(p => p.id === pickedProjectId && !p.is_locked) ?? defaultProject;

    const addMutation = useMutation({
        mutationFn: (args: { projectId: string; plantIds: string[] }) =>
            projectsApi.addPlantsBulk(args.projectId, args.plantIds),
        onSuccess: (result, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] });
            setLastProjectId(variables.projectId);
            try { localStorage.setItem(LAST_PROJECT_KEY, variables.projectId); } catch { /* storage unavailable */ }
            const projectName = projectOptions.find(p => p.id === variables.projectId)?.name ?? 'project';
            const skippedNote = result.skipped ? ` (${result.skipped} already in it)` : '';
            showAlert(`Added ${result.added} plant(s) to ${projectName}${skippedNote}.`, 'success');
            onAdded?.(variables.projectId);
        },
        onError: (error: any) => {
            showAlert('Failed to add plants to project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl shadow-2xl flex flex-wrap sm:flex-nowrap items-center justify-center sm:justify-start gap-2.5 sm:gap-3 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
            <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{plantIds.length} plant(s) selected</span>
            <Separator orientation="vertical" className="hidden sm:block h-4 bg-background/30" />
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
                {/* The button adds to the target project; the arrow only changes the target */}
                <div className="flex flex-1 sm:flex-none min-w-0">
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={!targetProject || addMutation.isPending}
                        onClick={() => targetProject && addMutation.mutate({ projectId: targetProject.id, plantIds })}
                        title={targetProject ? `Add the selected plants to ${targetProject.name}` : undefined}
                        className="flex-1 min-w-0 gap-1.5 text-foreground h-8 text-xs sm:text-sm rounded-r-none"
                    >
                        {addMutation.isPending
                            ? <><Loader2 size={13} className="animate-spin shrink-0" /> Adding…</>
                            : <>
                                <FolderPlus size={13} className="shrink-0" />
                                <span className="truncate max-w-[180px]">
                                    {isLoading ? 'Loading projects…'
                                        : targetProject ? `Add to ${targetProject.name}`
                                        : 'No unlocked projects'}
                                </span>
                            </>}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={projectOptions.length === 0 || addMutation.isPending}
                                aria-label="Choose a different project"
                                className="h-8 px-2 text-foreground rounded-l-none border-l border-foreground/15"
                            >
                                <ChevronDown size={14} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="end" className="w-64 max-h-72 overflow-y-auto">
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
                                Choose project
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuRadioGroup value={targetProject?.id ?? ''} onValueChange={setPickedProjectId}>
                                {projectOptions.map(proj => (
                                    <DropdownMenuRadioItem
                                        key={proj.id}
                                        value={proj.id}
                                        disabled={proj.is_locked}
                                        className="gap-2"
                                    >
                                        {proj.is_locked && <Lock size={13} className="shrink-0 text-muted-foreground" />}
                                        <span className="truncate">{proj.name}</span>
                                        {proj.id === defaultProject?.id && (
                                            <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-primary/80">Default</span>
                                        )}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onClear}
                    className="gap-1.5 text-background/80 hover:text-background hover:bg-white/10 h-8 text-xs sm:text-sm"
                >
                    <X size={13} /> Clear
                </Button>
            </div>
        </div>
    );
}
