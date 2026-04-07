import { createFileRoute } from '@tanstack/react-router';
import { ProjectManager } from '@/components/projects/ProjectManager';
import { projectsQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/projects/')({
    loader: async ({ context: { queryClient } }) => {
        await queryClient.ensureQueryData(projectsQueryOptions({ skip: 0, limit: 12, sort: 'newest' }));
        queryClient.prefetchQuery(projectsQueryOptions({ skip: 12, limit: 12, sort: 'newest' }));
    },
    component: ProjectManager,
});
