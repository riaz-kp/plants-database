import { createFileRoute } from '@tanstack/react-router';
import { CategoryManager } from '@/components/categories/CategoryManager';
import { categoriesQueryOptions } from '@/api/queryOptions';

export const Route = createFileRoute('/_authenticated/categories')({
    loader: ({ context: { queryClient } }) => {
        queryClient.prefetchQuery(categoriesQueryOptions({ skip: 0, limit: 20 }));
        queryClient.prefetchQuery(categoriesQueryOptions({ skip: 20, limit: 20 }));
    },
    component: CategoryManager,
});
