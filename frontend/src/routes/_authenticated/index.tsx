import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/components/common/Dashboard';
import { dashboardQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/')({
    loader: ({ context: { queryClient } }) => {
        queryClient.prefetchQuery(dashboardQueryOptions());
    },
    component: Dashboard,
});
