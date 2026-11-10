import React, { useState, useMemo, memo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
    Plus, Search, Pencil, Trash2, Copy, MoreVertical,
    LayoutGrid, List, FolderKanban, MapPin, User, Leaf,
    ChevronRight, Lock,
} from 'lucide-react';

import { projectsApi } from '../../api/projects';
import { projectsQueryOptions } from '../../api/queryOptions';
import type { ProjectCreate, ProjectSummary } from '../../types/project';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { ProjectFormDialog } from './ProjectFormDialog';
import { cn } from '@/lib-frontend/utils';
import { formatDate, timeAgo } from '@/lib-frontend/dates';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';



/* ─── Memoized Items ─── */
interface ProjectItemProps {
    project: ProjectSummary;
    onEdit: (project: ProjectSummary) => void;
    onDelete: (id: string, name: string) => void;
    onDuplicate: (id: string) => void;
}

const lastChange = (project: ProjectSummary) => project.updated_at || project.created_at;

const ActionsMenu = memo(({ project, onEdit, onDelete, onDuplicate }: ProjectItemProps) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={`Actions for ${project.name}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <MoreVertical className="w-4 h-4" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
                disabled={project.is_locked}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(project); }}
            >
                <Pencil className="w-4 h-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDuplicate(project.id); }}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={project.is_locked}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(project.id, project.name); }}
            >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
            {project.is_locked && (
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Unlock the project to edit or delete it.</p>
            )}
        </DropdownMenuContent>
    </DropdownMenu>
));

const ProjectIcon = ({ locked, className }: { locked: boolean; className?: string }) => (
    <div className={cn('relative flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0', className)}>
        <FolderKanban className="w-4 h-4 text-primary" />
        {locked && (
            <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-card ring-1 ring-border">
                <Lock className="w-2.5 h-2.5 text-muted-foreground" aria-label="Locked" />
            </span>
        )}
    </div>
);

const PlantCount = ({ count, compact }: { count: number; compact?: boolean }) => (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground tabular-nums">
        <Leaf className="w-3.5 h-3.5 text-secondary" />
        {count}
        <span className={cn('text-xs font-normal text-muted-foreground', compact && 'hidden sm:inline')}>
            {count === 1 ? 'plant' : 'plants'}
        </span>
    </span>
);

/* The name link stretches over the whole card or row (::after), so a click anywhere opens the
   project, and cmd/middle-click still opens it in a new tab. The actions menu sits above it. */
const STRETCHED_LINK =
    "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";

const ProjectCardMemo = memo(({ project, onEdit, onDelete, onDuplicate }: ProjectItemProps) => (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card shadow-sm hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200">
        <div className="flex items-start gap-3 p-5 pb-3">
            <ProjectIcon locked={project.is_locked} />
            <div className="min-w-0 flex-1 pt-0.5">
                <Link
                    to="/projects/$id"
                    params={{ id: project.id }}
                    className={cn('block font-semibold text-foreground leading-snug group-hover:text-primary transition-colors', STRETCHED_LINK, 'after:rounded-xl')}
                >
                    {project.name}
                </Link>
                {project.is_locked && <span className="text-[11px] text-muted-foreground">Locked</span>}
            </div>
            <div className="relative z-10 -mr-2 -mt-1">
                <ActionsMenu project={project} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
            </div>
        </div>

        <div className="flex flex-col gap-1.5 px-5 pb-4 flex-1 text-xs text-muted-foreground">
            {project.client_name && (
                <span className="flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{project.client_name}</span>
                </span>
            )}
            {project.location && (
                <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{project.location}</span>
                </span>
            )}
            {project.description && (
                <p className="leading-relaxed line-clamp-2 mt-1">{project.description}</p>
            )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30 rounded-b-xl">
            <PlantCount count={project.plant_count} />
            <span className="text-xs text-muted-foreground" title={formatDate(lastChange(project))}>
                Updated {timeAgo(lastChange(project))}
            </span>
        </div>
    </div>
));

const ProjectTableRowMemo = memo(({ project, onEdit, onDelete, onDuplicate }: ProjectItemProps) => {
    const mobileMeta = [project.client_name, project.location].filter(Boolean).join(' · ');
    return (
        <TableRow className="group relative cursor-pointer hover:bg-muted/40 transition-colors">
            {/* Below md the name column takes the leftover width and truncates, keeping the actions on screen */}
            <TableCell className="py-3 w-full max-w-0 md:w-auto md:max-w-none">
                <div className="flex items-center gap-3 min-w-0">
                    <ProjectIcon locked={project.is_locked} />
                    <div className="min-w-0">
                        <Link
                            to="/projects/$id"
                            params={{ id: project.id }}
                            className={cn('block font-medium text-foreground truncate group-hover:text-primary transition-colors', STRETCHED_LINK)}
                        >
                            {project.name}
                        </Link>
                        {mobileMeta && <p className="text-xs text-muted-foreground truncate md:hidden">{mobileMeta}</p>}
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-muted-foreground hidden md:table-cell">
                {project.client_name || <span className="opacity-40">—</span>}
            </TableCell>
            <TableCell className="text-muted-foreground hidden lg:table-cell">
                {project.location ? (
                    <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0 opacity-60" /> {project.location}
                    </span>
                ) : <span className="opacity-40">—</span>}
            </TableCell>
            <TableCell className="whitespace-nowrap">
                <PlantCount count={project.plant_count} compact />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm hidden sm:table-cell whitespace-nowrap" title={formatDate(lastChange(project))}>
                {timeAgo(lastChange(project))}
            </TableCell>
            <TableCell className="w-20 pl-0 pr-3">
                <div className="flex items-center justify-end gap-1">
                    <span className="relative z-10">
                        <ActionsMenu project={project} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
                    </span>
                    <ChevronRight className="hidden sm:block w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
            </TableCell>
        </TableRow>
    );
});

const VIEW_KEY = 'projectsView';

type ApiError = Error & { response?: { data?: { detail?: string } } };

/* ─── ProjectManager ─────────────────────────────────────── */
export const ProjectManager = () => {
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();

    const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
        try { return localStorage.getItem(VIEW_KEY) === 'card' ? 'card' : 'table'; } catch { return 'table'; }
    });
    const changeView = (mode: 'card' | 'table') => {
        setViewMode(mode);
        try { localStorage.setItem(VIEW_KEY, mode); } catch { /* storage unavailable */ }
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc'>('newest');
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 12;

    React.useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

    const projectsParams = useMemo(() => ({
        skip: (currentPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        sort: sortBy
    }), [currentPage, debouncedSearch, sortBy]);

    const { data: projectsData, isLoading } = useQuery(projectsQueryOptions(projectsParams));

    React.useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, sortBy]);

    const projects = projectsData?.items || [];
    const totalProjects = projectsData?.total || 0;
    const totalPages = Math.max(1, Math.ceil(totalProjects / PAGE_SIZE));

    // Prefetch functionality
    React.useEffect(() => {
        if (currentPage < totalPages) {
            const nextPage = currentPage + 1;
            const nextParams = {
                ...projectsParams,
                skip: (nextPage - 1) * PAGE_SIZE,
            };
            queryClient.prefetchQuery(projectsQueryOptions(nextParams));
        }
    }, [currentPage, totalPages, projectsParams, queryClient]);

    const createMutation = useMutation({
        mutationFn: projectsApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project created successfully', 'success');
            closeDialog();
        },
        onError: (error: ApiError) => {
            showAlert('Error creating project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<ProjectCreate> }) =>
            projectsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project updated successfully', 'success');
            closeDialog();
        },
        onError: (error: ApiError) => {
            showAlert('Error updating project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: projectsApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project deleted successfully', 'success');
        },
        onError: (error: ApiError) => {
            showAlert('Error deleting project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const duplicateMutation = useMutation({
        mutationFn: projectsApi.duplicate,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project duplicated successfully', 'success');
        },
        onError: (error: ApiError) => {
            showAlert('Error duplicating project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const handleDuplicate = useCallback((id: string) => duplicateMutation.mutate(id), [duplicateMutation]);

    const openCreate = useCallback(() => {
        setEditingProject(null);
        setIsDialogOpen(true);
    }, []);

    const openEdit = useCallback((project: ProjectSummary) => {
        setEditingProject(project);
        setIsDialogOpen(true);
    }, []);

    const closeDialog = useCallback(() => {
        setIsDialogOpen(false);
        setEditingProject(null);
    }, []);

    const handleDelete = useCallback((id: string, projectName: string) => {
        confirm({
            title: 'Delete Project',
            message: `Are you sure you want to delete "${projectName}"? All associated plant records will be removed.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: () => deleteMutation.mutate(id),
        });
    }, [confirm, deleteMutation]);

    const handleSubmit = (data: ProjectCreate) => {
        if (editingProject) {
            updateMutation.mutate({ id: editingProject.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    const displayedProjects = projects;

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0">
                    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                        Projects
                        {totalProjects > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                                {totalProjects}
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Landscape plans, their plants, BOQs and quotations.
                    </p>
                </div>
                <Button onClick={openCreate} className="shrink-0 gap-1.5 shadow-sm">
                    <Plus className="w-4 h-4" />
                    <span className="hidden xs:inline">New project</span>
                    <span className="xs:hidden">New</span>
                </Button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, client or location…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 bg-card"
                    />
                </div>
                {/* Sort + view toggle share one row on phones */}
                <div className="flex items-center gap-2">
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                        <SelectTrigger className="flex-1 min-w-0 sm:flex-none sm:w-44 bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Newest first</SelectItem>
                            <SelectItem value="oldest">Oldest first</SelectItem>
                            <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                            <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                        </SelectContent>
                    </Select>
                    {/* View toggle */}
                    <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-card shrink-0">
                        {([['table', List, 'List view'], ['card', LayoutGrid, 'Card view']] as const).map(([mode, Icon, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => changeView(mode)}
                                title={label}
                                aria-label={label}
                                aria-pressed={viewMode === mode}
                                className={cn(
                                    'flex items-center justify-center h-8 w-8 rounded-md transition-colors',
                                    viewMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                                )}
                            >
                                <Icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                viewMode === 'card' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-44 w-full rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <div className="rounded-xl border border-border bg-card shadow-sm divide-y divide-border">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                <Skeleton className="w-9 h-9 rounded-lg" />
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-4 w-16 ml-auto" />
                            </div>
                        ))}
                    </div>
                )
            ) : displayedProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 rounded-xl border border-dashed border-border bg-card/50 text-center">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                        <FolderKanban className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {searchTerm ? 'No projects match your search.' : 'No projects yet. Create your first one.'}
                    </p>
                    {!searchTerm && (
                        <Button size="sm" onClick={openCreate} className="gap-1.5">
                            <Plus className="w-4 h-4" /> New project
                        </Button>
                    )}
                </div>
            ) : viewMode === 'card' ? (
                /* ── Card Grid ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {displayedProjects.map((project) => (
                        <ProjectCardMemo
                            key={project.id}
                            project={project}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                        />
                    ))}
                </div>
            ) : (
                /* ── Table View ── */
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableHead className="h-10 text-xs font-medium uppercase tracking-wide">Project</TableHead>
                                <TableHead className="h-10 text-xs font-medium uppercase tracking-wide hidden md:table-cell">Client</TableHead>
                                <TableHead className="h-10 text-xs font-medium uppercase tracking-wide hidden lg:table-cell">Location</TableHead>
                                <TableHead className="h-10 text-xs font-medium uppercase tracking-wide">Plants</TableHead>
                                <TableHead className="h-10 text-xs font-medium uppercase tracking-wide hidden sm:table-cell">Updated</TableHead>
                                <TableHead className="h-10 w-20" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayedProjects.map((project) => (
                                <ProjectTableRowMemo
                                    key={project.id}
                                    project={project}
                                    onEdit={openEdit}
                                    onDelete={handleDelete}
                                    onDuplicate={handleDuplicate}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground bg-card px-4 py-3 rounded-xl border border-border shadow-sm">
                    <span>
                        Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalProjects)} of {totalProjects}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => p - 1)}
                            className="h-8"
                        >
                            Previous
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <Button
                                    key={p}
                                    variant={currentPage === p ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setCurrentPage(p)}
                                >
                                    {p}
                                </Button>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="h-8"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {/* Create / Edit Dialog */}
            <ProjectFormDialog
                open={isDialogOpen}
                project={editingProject}
                isSaving={isSaving}
                onClose={closeDialog}
                onSubmit={handleSubmit}
            />
        </div>
    );
};
