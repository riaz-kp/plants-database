import { createFileRoute } from '@tanstack/react-router';
import { PlantManager } from '@/components/plants/PlantManager';
import { plantsQueryOptions, taxonomyTreeQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/plants/')({
    loader: async ({ context: { queryClient } }) => {
        const p1 = queryClient.ensureQueryData(plantsQueryOptions({ skip: 0, limit: 20, sort: 'recent' }));
        const p2 = queryClient.ensureQueryData(taxonomyTreeQueryOptions());
        // prefetch page 2
        queryClient.prefetchQuery(plantsQueryOptions({ skip: 20, limit: 20, sort: 'recent' }));
        await Promise.all([p1, p2]);
    },
    component: PlantManager,
});
