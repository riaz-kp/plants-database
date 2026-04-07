import { createFileRoute } from '@tanstack/react-router';
import { TaxonomyManager } from '@/components/taxonomy/TaxonomyManager';
import { taxonomyTreeQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/taxonomy')({
    loader: ({ context: { queryClient } }) => {
        queryClient.prefetchQuery(taxonomyTreeQueryOptions());
    },
    component: TaxonomyManager,
});
