import { createFileRoute } from '@tanstack/react-router';
import { ProjectDetails } from '@/components/projects/ProjectDetails';
import { projectDetailsQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/projects/$id')({
    loader: ({ params, context: { queryClient } }) => {
        queryClient.prefetchQuery(projectDetailsQueryOptions(params.id));
        // The taxonomy tree is fetched on first PDF export, not up front
    },
    component: ProjectDetails,
});
