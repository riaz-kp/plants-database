import { createFileRoute } from '@tanstack/react-router';
import { ProjectDetails } from '@/components/projects/ProjectDetails';
import { projectDetailsQueryOptions, taxonomyTreeQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/projects/$id')({
    loader: ({ params, context: { queryClient } }) => {
        queryClient.prefetchQuery(projectDetailsQueryOptions(params.id));
        queryClient.prefetchQuery(taxonomyTreeQueryOptions());
    },
    component: ProjectDetails,
});
