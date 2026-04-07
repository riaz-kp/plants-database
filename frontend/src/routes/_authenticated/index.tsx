import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/common/Dashboard';
import { dashboardQueryOptions, plantsQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/')({
    loader: ({ context: { queryClient } }) => {
        queryClient.prefetchQuery(dashboardQueryOptions());
        queryClient.prefetchQuery(plantsQueryOptions({ skip: 0, limit: 20, sort: 'recent' }));
    },
    component: Dashboard,
});
