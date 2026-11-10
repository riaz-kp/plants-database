import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/common/Dashboard';
import {
    DASHBOARD_LISTS, categoriesQueryOptions, dashboardQueryOptions, plantsQueryOptions, projectsQueryOptions,
} from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/')({
    loader: ({ context: { queryClient } }) => {
        queryClient.prefetchQuery(dashboardQueryOptions());
        queryClient.prefetchQuery(projectsQueryOptions(DASHBOARD_LISTS.projects));
        queryClient.prefetchQuery(plantsQueryOptions(DASHBOARD_LISTS.plants));
        queryClient.prefetchQuery(categoriesQueryOptions(DASHBOARD_LISTS.categories));
    },
    component: Dashboard,
});
