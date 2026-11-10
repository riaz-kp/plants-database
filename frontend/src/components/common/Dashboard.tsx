import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
    Leaf, ListTree, Tags, FolderKanban, ArrowRight, RefreshCcw, Plus, ChevronDown,
    ChevronRight, Lock, Upload, MapPin,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn, cloudinaryThumb } from '@/lib-frontend/utils';
import { timeAgo } from '@/lib-frontend/dates';
import {
    DASHBOARD_LISTS, categoriesQueryOptions, dashboardQueryOptions, plantsQueryOptions, projectsQueryOptions,
} from '../../api/queryOptions';
import { projectsApi } from '../../api/projects';
import { useAlert } from '../../contexts/AlertContext';
import { ProjectFormDialog } from '../projects/ProjectFormDialog';
import type { ProjectCreate, ProjectSummary } from '../../types/project';
import type { Plant } from '../../types/plant';

const RECENT_PROJECTS = 5;
const RECENT_PLANTS = 6;
const TOP_CATEGORIES = 6;

/* ─── Count cards ─────────────────────────────────────────────── */

const StatCard = ({ title, value, icon: Icon, to, color, isLoading }: {
    title: string;
    value?: number;
    icon: React.ElementType;
    to: string;
    color: string;
    isLoading?: boolean;
}) => (
    <Link to={to} className="group block">
        <Card className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200">
            <div className={cn('flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl shrink-0', color)}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
                {isLoading ? (
                    <Skeleton className="h-7 w-14 mt-1" />
                ) : (
                    <p className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
                        {value?.toLocaleString() ?? '—'}
                    </p>
                )}
            </div>
            <ChevronRight className="hidden sm:block w-4 h-4 ml-auto shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </Card>
    </Link>
);

/* ─── Section shell ───────────────────────────────────────────── */

const Section = ({ title, to, linkLabel = 'View all', className, children }: {
    title: string;
    to: string;
    linkLabel?: string;
    className?: string;
    children: React.ReactNode;
}) => (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <Link
                to={to}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
            >
                {linkLabel} <ArrowRight className="w-3 h-3" />
            </Link>
        </div>
        {children}
    </Card>
);

const EmptyState = ({ icon: Icon, text, action }: { icon: React.ElementType; text: string; action?: React.ReactNode }) => (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
            <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
        {action}
    </div>
);

/* ─── Recent projects ─────────────────────────────────────────── */

const ProjectRow = ({ project }: { project: ProjectSummary }) => {
    const meta = [project.client_name, project.location].filter(Boolean).join(' · ');
    return (
        <Link
            to="/projects/$id"
            params={{ id: project.id }}
            className="group flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
        >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 shrink-0">
                <FolderKanban className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                    <span className="truncate">{project.name}</span>
                    {project.is_locked && <Lock className="w-3 h-3 shrink-0 text-muted-foreground" aria-label="Locked" />}
                </p>
                {meta && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        {project.location && <MapPin className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{meta}</span>
                    </p>
                )}
            </div>
            <div className="text-right shrink-0">
                <p className="text-sm font-medium text-foreground tabular-nums">
                    {project.plant_count} <span className="text-xs font-normal text-muted-foreground">plants</span>
                </p>
                <p className="text-xs text-muted-foreground">{timeAgo(project.updated_at || project.created_at)}</p>
            </div>
            <ChevronRight className="hidden sm:block w-4 h-4 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </Link>
    );
};

const RowSkeletons = ({ count }: { count: number }) => (
    <div className="divide-y divide-border">
        {Array.from({ length: count }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-8 w-14" />
            </div>
        ))}
    </div>
);

/* ─── Plants by category ──────────────────────────────────────── */

const CategoryBars = ({ categories }: { categories: { name: string; count: number }[] }) => {
    const max = Math.max(1, ...categories.map(c => c.count));
    return (
        <div className="px-3 pb-3 space-y-0.5">
            {categories.map(c => (
                <Link
                    key={c.name}
                    to="/plants"
                    search={{ category: c.name } as never}
                    className="group block rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
                >
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{c.name}</span>
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">{c.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                            className="h-full rounded-full bg-secondary group-hover:bg-primary transition-colors"
                            style={{ width: `${Math.max(2, (c.count / max) * 100)}%` }}
                        />
                    </div>
                </Link>
            ))}
        </div>
    );
};

/* ─── Recently added plants ───────────────────────────────────── */

const PlantTile = ({ plant }: { plant: Plant }) => {
    const image = plant.image_url || plant.icon_url;
    return (
        <Link to="/plants/$id" params={{ id: plant.id }} className="group block min-w-0">
            <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border group-hover:border-primary/40 transition-colors">
                {image ? (
                    <img
                        src={cloudinaryThumb(image, 160)}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Leaf className="w-7 h-7 text-muted-foreground/40" />
                    </div>
                )}
            </div>
            <p className="mt-2 text-xs sm:text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {plant.common_name}
            </p>
            <p className="text-xs italic text-muted-foreground truncate">{plant.scientific_name || plant.category}</p>
        </Link>
    );
};

/* ─── Page ────────────────────────────────────────────────────── */

export const Dashboard = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showAlert } = useAlert();
    const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);

    const statsQuery = useQuery(dashboardQueryOptions());
    const projectsQuery = useQuery(projectsQueryOptions(DASHBOARD_LISTS.projects));
    const plantsQuery = useQuery(plantsQueryOptions(DASHBOARD_LISTS.plants));
    const categoriesQuery = useQuery(categoriesQueryOptions(DASHBOARD_LISTS.categories));

    const stats = statsQuery.data;
    const recentProjects = projectsQuery.data?.items.slice(0, RECENT_PROJECTS) ?? [];
    const recentPlants = plantsQuery.data?.items.slice(0, RECENT_PLANTS) ?? [];
    const topCategories = (categoriesQuery.data?.items ?? [])
        .map(c => ({ name: c.name, count: c.plant_count ?? 0 }))
        .filter(c => c.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_CATEGORIES);

    const queries = [statsQuery, projectsQuery, plantsQuery, categoriesQuery];
    const isRefreshing = queries.some(q => q.isFetching);
    const refreshAll = () => queries.forEach(q => q.refetch());

    const createProject = useMutation({
        mutationFn: projectsApi.create,
        onSuccess: (project) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            showAlert('Project created', 'success');
            setIsProjectDialogOpen(false);
            navigate({ to: '/projects/$id', params: { id: project.id } });
        },
        onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
            showAlert('Error creating project: ' + (error.response?.data?.detail || error.message), 'error');
        },
    });

    // The plant editor lives on the Plants page; this opens it there straight away
    const newPlant = () => navigate({ to: '/plants', state: { createPlant: true } as never });
    const newProject = () => setIsProjectDialogOpen(true);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground text-sm mt-1">Your plant catalog and projects at a glance.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={refreshAll}
                        disabled={isRefreshing}
                        title="Refresh"
                        aria-label="Refresh"
                        className="h-9 w-9 border-border/60"
                    >
                        <RefreshCcw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="h-9 gap-1.5 shadow-sm">
                                <Plus className="h-4 w-4" />
                                New
                                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onSelect={newProject} className="gap-2 cursor-pointer">
                                <FolderKanban className="h-4 w-4" /> Project
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={newPlant} className="gap-2 cursor-pointer">
                                <Leaf className="h-4 w-4" /> Plant
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                                <Link to="/plants/import">
                                    <Upload className="h-4 w-4" /> Import plants from CSV
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <StatCard title="Plants" value={stats?.total_plants} icon={Leaf} to="/plants" color="bg-primary" isLoading={statsQuery.isLoading} />
                <StatCard title="Projects" value={stats?.total_projects} icon={FolderKanban} to="/projects" color="bg-primary" isLoading={statsQuery.isLoading} />
                <StatCard title="Categories" value={stats?.total_categories} icon={Tags} to="/categories" color="bg-accent" isLoading={statsQuery.isLoading} />
                <StatCard title="Taxonomy"value={stats?.total_taxonomy_nodes} icon={ListTree} to="/taxonomy" color="bg-secondary" isLoading={statsQuery.isLoading} />
            </div>

            {/* Recent projects + categories */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <Section title="Recent projects" to="/projects" className="lg:col-span-2">
                    {projectsQuery.isLoading ? (
                        <RowSkeletons count={RECENT_PROJECTS} />
                    ) : recentProjects.length ? (
                        <div className="divide-y divide-border border-t border-border">
                            {recentProjects.map(p => <ProjectRow key={p.id} project={p} />)}
                        </div>
                    ) : (
                        <EmptyState
                            icon={FolderKanban}
                            text="No projects yet."
                            action={<Button size="sm" onClick={newProject} className="gap-1.5"><Plus className="h-4 w-4" /> New project</Button>}
                        />
                    )}
                </Section>

                <Section title="Plants by category" to="/categories" linkLabel="All categories">
                    {categoriesQuery.isLoading ? (
                        <div className="px-5 pb-4 space-y-4">
                            {Array.from({ length: TOP_CATEGORIES }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                        </div>
                    ) : topCategories.length ? (
                        <CategoryBars categories={topCategories} />
                    ) : (
                        <EmptyState icon={Tags} text="No plants in any category yet." />
                    )}
                </Section>
            </div>

            {/* Recently added plants */}
            <Section title="Recently added plants" to="/plants">
                {plantsQuery.isLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4 px-5 pb-5">
                        {Array.from({ length: RECENT_PLANTS }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
                    </div>
                ) : recentPlants.length ? (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4 px-5 pb-5">
                        {recentPlants.map(p => <PlantTile key={p.id} plant={p} />)}
                    </div>
                ) : (
                    <EmptyState
                        icon={Leaf}
                        text="No plants in the catalog yet."
                        action={<Button size="sm" onClick={newPlant} className="gap-1.5"><Plus className="h-4 w-4" /> New plant</Button>}
                    />
                )}
            </Section>

            <ProjectFormDialog
                open={isProjectDialogOpen}
                project={null}
                isSaving={createProject.isPending}
                onClose={() => setIsProjectDialogOpen(false)}
                onSubmit={(data: ProjectCreate) => createProject.mutate(data)}
            />
        </div>
    );
};
