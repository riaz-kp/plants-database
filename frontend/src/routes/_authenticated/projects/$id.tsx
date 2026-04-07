import { createFileRoute } from '@tanstack/react-router';
import { ProjectDetails } from '@/components/projects/ProjectDetails';
import { projectDetailsQueryOptions, taxonomyTreeQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/projects/$id')({
    loader: async ({ params, context: { queryClient } }) => {
        const p1 = queryClient.ensureQueryData(projectDetailsQueryOptions(params.id));
        const p2 = queryClient.ensureQueryData(taxonomyTreeQueryOptions());
        await Promise.all([p1, p2]);
    },
    component: ProjectDetails,
});
