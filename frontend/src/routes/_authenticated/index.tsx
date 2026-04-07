import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/common/Dashboard';
import { dashboardQueryOptions, plantsQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/')({
    loader: async ({ context: { queryClient } }) => {
        const statsPromise = queryClient.ensureQueryData(dashboardQueryOptions());
        // Prefetch the first page of plants so it's ready when the user clicks
        // Do not await this so the dashboard stats do not lag
        queryClient.prefetchQuery(plantsQueryOptions({ skip: 0, limit: 20, sort: 'recent' }));
        return await statsPromise;
    },
    component: Dashboard,
});
