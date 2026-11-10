import { createFileRoute } from '@tanstack/react-router';
import { ProjectImportPage } from '@/components/projects/ProjectImportPage';
import { projectDetailsQueryOptions } from '@/api/queryOptions';

// "$id_" keeps this page beside the project page rather than inside it: /projects/$id/import
export const Route = createFileRoute('/_authenticated/projects/$id_/import')({
    loader: ({ params, context: { queryClient } }) => {
        queryClient.prefetchQuery(projectDetailsQueryOptions(params.id));
    },
    component: ProjectImportPage,
});
