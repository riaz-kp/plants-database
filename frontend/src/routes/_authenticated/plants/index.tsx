import { createFileRoute } from '@tanstack/react-router';
import { PlantManager } from '@/components/plants/PlantManager';
import { plantsQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/plants/')({
    loader: ({ context: { queryClient } }) => {
        queryClient.prefetchQuery(plantsQueryOptions({ skip: 0, limit: 20, sort: 'recent' }));
        // The taxonomy tree is only needed by the plant form, which fetches it itself
        // prefetch page 2
        queryClient.prefetchQuery(plantsQueryOptions({ skip: 20, limit: 20, sort: 'recent' }));
    },
    component: PlantManager,
});
