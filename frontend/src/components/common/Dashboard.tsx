import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Leaf, ListTree, Tags, FolderKanban, ArrowRight, RefreshCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { cn } from '@/lib-frontend/utils';
import { dashboardQueryOptions, plantsQueryOptions } from '../../api/queryOptions';
import { useEffect } from 'react';
import { queryClient } from '@/api/queryClient';

const StatCard = ({
    title,
    value,
    icon: Icon,
    to,
    color,
    isLoading
}: {
    title: string;
    value?: number | string;
    icon: React.ElementType;
    to: string;
    color: string;
    isLoading?: boolean;
}) => (
    <Link to={to} className="group block">
        <Card className="border border-border hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${color}`}>
                    <Icon className="w-4 h-4 text-white" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-semibold tracking-tight text-foreground mb-1">
                    {isLoading ? (
                        <Skeleton className="h-9 w-20" />
                    ) : (
                        value ?? <span className="text-muted-foreground text-xl">—</span>
                    )}
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-primary flex items-center gap-1 transition-colors">
                    View all <ArrowRight className="w-3 h-3" />
                </span>
            </CardContent>
        </Card>
    </Link>
);



export const Dashboard = () => {
    const { data: stats, isLoading, refetch, isFetching } = useQuery(dashboardQueryOptions());

    useEffect(() => {
        queryClient.prefetchQuery(plantsQueryOptions({ skip: 0, limit: 20, sort: 'recent' }));
    }, [])

    return (
        <div>
            {/* Page header */}
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Welcome to the Landschaft Plants Database.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => refetch()} 
                        onMouseEnter={() => {
                            if (!isFetching) {
                                queryClient.prefetchQuery(dashboardQueryOptions());
                            }
                        }}
                        disabled={isFetching}
                        className="h-9 px-3 gap-2 border-border/60 hover:bg-muted font-medium transition-all"
                    >
                        <RefreshCcw className={cn("h-4 w-4 transition-transform", isFetching && "animate-spin")} />
                        {isFetching ? 'Refreshing...' : 'Refresh'}
                    </Button>
                </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Total Plants"
                    value={stats?.total_plants}
                    icon={Leaf}
                    to="/plants"
                    color="bg-primary"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Taxonomy Nodes"
                    value={stats?.total_taxonomy_nodes}
                    icon={ListTree}
                    to="/taxonomy"
                    color="bg-secondary"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Categories"
                    value={stats?.total_categories}
                    icon={Tags}
                    to="/categories"
                    color="bg-accent"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Projects"
                    value={stats?.total_projects}
                    icon={FolderKanban}
                    to="/projects"
                    color="bg-primary"
                    isLoading={isLoading}
                />
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                    { title: 'Plant Catalog', desc: 'Browse and manage species details and care information.', to: '/plants', icon: Leaf },
                    { title: 'Taxonomy', desc: 'Manage the hierarchical classification of plants.', to: '/taxonomy', icon: ListTree },
                    { title: 'Categories', desc: 'Organise plants into custom categories.', to: '/categories', icon: Tags },
                    { title: 'Projects', desc: 'Track landscape planning and design projects.', to: '/projects', icon: FolderKanban },
                ].map(({ title, desc, to, icon: Icon }) => (
                    <Link to={to} key={to} className="group">
                        <Card className="border border-border hover:border-primary/40 hover:shadow-md transition-all duration-200 h-full">
                            <CardContent className="flex items-start gap-4 pt-5">
                                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted shrink-0 group-hover:bg-primary/10 transition-colors">
                                    <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div>
                                    <p className="font-medium text-foreground text-sm">{title}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary ml-auto self-center transition-colors" />
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
};
