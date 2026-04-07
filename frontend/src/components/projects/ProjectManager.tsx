import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
    Plus, Search, Pencil, Trash2, Copy, MoreVertical,
    LayoutGrid, List, FolderKanban, MapPin, User, CalendarDays, Leaf,
    ChevronRight,
} from 'lucide-react';

import { projectsApi } from '../../api/projects';
import { projectsQueryOptions } from '../../api/queryOptions';
import type { ProjectCreate, Project } from '../../types/project';
import { useAlert } from '../../contexts/AlertContext';
import { useConfirm } from '../../contexts/ConfirmContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
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


/* ─── helpers ─── */
const formatDate = (dateString: string) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(
        new Date(dateString),
    );

/* ─── ProjectManager ─────────────────────────────────────── */
export const ProjectManager = () => {
    const queryClient = useQueryClient();
    const { showAlert } = useAlert();
    const { confirm } = useConfirm();

    const [viewMode, setViewMode] = useState<'card' | 'table'>('table');
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
    const [editingProject, setEditingProject] = useState<Project | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [clientName, setClientName] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');

    const projectsParams = {
        skip: (currentPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        sort: sortBy
    };

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
        onError: (error: any) => {
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
        onError: (error: any) => {
            showAlert('Error updating project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: projectsApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project deleted successfully', 'success');
        },
        onError: (error: any) => {
            showAlert('Error deleting project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const duplicateMutation = useMutation({
        mutationFn: projectsApi.duplicate,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            showAlert('Project duplicated successfully', 'success');
        },
        onError: (error: any) => {
            showAlert('Error duplicating project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    const openCreate = () => {
        setEditingProject(null);
        setName(''); setClientName(''); setLocation(''); setDescription('');
        setIsDialogOpen(true);
    };

    const openEdit = (project: Project) => {
        setEditingProject(project);
        setName(project.name);
        setClientName(project.client_name || '');
        setLocation(project.location || '');
        setDescription(project.description || '');
        setIsDialogOpen(true);
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
        setEditingProject(null);
        setName(''); setClientName(''); setLocation(''); setDescription('');
    };

    const handleDelete = (id: string, projectName: string) => {
        confirm({
            title: 'Delete Project',
            message: `Are you sure you want to delete "${projectName}"? All associated plant records will be removed.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: () => deleteMutation.mutate(id),
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const data = { name, client_name: clientName, location, description };
        if (editingProject) {
            updateMutation.mutate({ id: editingProject.id, data });
        } else {
            createMutation.mutate(data as ProjectCreate);
        }
    };

    const isSaving = createMutation.isPending || updateMutation.isPending;

    const displayedProjects = projects;

    /* ── Actions Menu ── */
    const ActionsMenu = ({ project }: { project: Project }) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.preventDefault()}>
                    <MoreVertical className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); openEdit(project); }}>
                    <Pencil className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); duplicateMutation.mutate(project.id); }}>
                    <Copy className="w-4 h-4 mr-2" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => { e.preventDefault(); handleDelete(project.id, project.name); }}
                >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col gap-1 mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Track landscape planning and design projects.
                    </p>
                </div>
                <Button onClick={openCreate} className="mt-3 sm:mt-0 w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    New Project
                </Button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search projects…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="w-full sm:w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        <SelectItem value="name-asc">Name (A–Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z–A)</SelectItem>
                    </SelectContent>
                </Select>
                {/* View toggle */}
                <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-muted/30 shrink-0">
                    <Button
                        variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setViewMode('table')}
                        title="List view"
                    >
                        <List className="w-4 h-4" />
                    </Button>
                    <Button
                        variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setViewMode('card')}
                        title="Card view"
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-xl" />
                    ))}
                </div>
            ) : displayedProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <FolderKanban className="w-10 h-10 mb-3 opacity-25" />
                    <p className="text-sm">
                        {searchTerm ? 'No projects match your search.' : 'No projects yet. Create your first one.'}
                    </p>
                </div>
            ) : viewMode === 'card' ? (
                /* ── Card Grid ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {displayedProjects.map((project) => (
                        <Link
                            key={project.id}
                            to={`/projects/${project.id}` as any}
                            className="group relative rounded-xl border border-border bg-white shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 flex flex-col overflow-hidden"
                        >
                            <div className="flex items-start justify-between p-5 pb-3">
                                <h3 className="font-semibold text-foreground text-base leading-snug group-hover:text-primary transition-colors pr-2">
                                    {project.name}
                                </h3>
                                <div className="shrink-0" onClick={(e) => e.preventDefault()}>
                                    <ActionsMenu project={project} />
                                </div>
                            </div>
                            <div className="px-5 pb-5 flex flex-col gap-2 flex-1">
                                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                                    {project.client_name && (
                                        <span className="flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 shrink-0" /> {project.client_name}
                                        </span>
                                    )}
                                    {project.location && (
                                        <span className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 shrink-0" /> {project.location}
                                        </span>
                                    )}
                                </div>
                                {project.description && (
                                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-1">
                                        {project.description}
                                    </p>
                                )}
                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                                    <Badge variant="secondary" className="text-xs font-medium">
                                        <Leaf className="w-3 h-3 mr-1" />
                                        {project.plants?.length ?? 0} plants
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <CalendarDays className="w-3 h-3" />
                                        {formatDate(project.updated_at || project.created_at)}
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                /* ── Table View ── */
                <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="font-semibold">Name</TableHead>
                                <TableHead className="font-semibold hidden md:table-cell">Client</TableHead>
                                <TableHead className="font-semibold hidden lg:table-cell">Location</TableHead>
                                <TableHead className="font-semibold hidden sm:table-cell">Updated</TableHead>
                                <TableHead className="font-semibold">Plants</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {displayedProjects.map((project) => (
                                <TableRow key={project.id} className="hover:bg-muted/30 transition-colors group">
                                    <TableCell>
                                        <Link
                                            to={`/projects/${project.id}` as any}
                                            className="font-medium text-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                        >
                                            {project.name}
                                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </Link>
                                        {project.client_name && (
                                            <p className="text-xs text-muted-foreground mt-0.5 md:hidden">{project.client_name}</p>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground hidden md:table-cell">
                                        {project.client_name || <span className="opacity-40">—</span>}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                                        {project.location || <span className="opacity-40">—</span>}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                                        {formatDate(project.updated_at || project.created_at)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="tabular-nums">
                                            {project.plants?.length ?? 0}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <ActionsMenu project={project} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 text-sm text-muted-foreground bg-white p-4 rounded-xl border border-border shadow-sm">
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
            <Dialog open={isDialogOpen} onOpenChange={(o) => !o && closeDialog()}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingProject ? 'Edit Project' : 'New Project'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="proj-name">Project Name <span className="text-destructive">*</span></Label>
                            <Input
                                id="proj-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Riverside Park Redesign"
                                required
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="proj-client">Client</Label>
                                <Input
                                    id="proj-client"
                                    value={clientName}
                                    onChange={(e) => setClientName(e.target.value)}
                                    placeholder="Client name"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="proj-location">Location</Label>
                                <Input
                                    id="proj-location"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="City or site"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="proj-desc">Description</Label>
                            <Textarea
                                id="proj-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Brief project overview…"
                                rows={3}
                                className="resize-none"
                            />
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving || !name.trim()}>
                                {isSaving ? 'Saving…' : editingProject ? 'Save Changes' : 'Create Project'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};
