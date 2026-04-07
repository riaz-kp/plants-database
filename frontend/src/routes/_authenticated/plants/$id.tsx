import { createFileRoute } from '@tanstack/react-router';
import { PlantDetails } from '@/components/plants/PlantDetails';
import { plantDetailsQueryOptions, taxonomyTreeQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/plants/$id')({
    loader: ({ params, context: { queryClient } }) => {
        queryClient.prefetchQuery(plantDetailsQueryOptions(params.id));
        queryClient.prefetchQuery(taxonomyTreeQueryOptions());
    },
    component: PlantDetails,
});
