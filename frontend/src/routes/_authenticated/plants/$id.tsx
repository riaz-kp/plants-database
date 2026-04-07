import { createFileRoute } from '@tanstack/react-router';
import { PlantDetails } from '@/components/plants/PlantDetails';
import { plantDetailsQueryOptions, taxonomyTreeQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/plants/$id')({
    loader: async ({ params, context: { queryClient } }) => {
        const p1 = queryClient.ensureQueryData(plantDetailsQueryOptions(params.id));
        const p2 = queryClient.ensureQueryData(taxonomyTreeQueryOptions());
        await Promise.all([p1, p2]);
    },
    component: PlantDetails,
});
