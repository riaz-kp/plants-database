import { createRouter } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { AppLoading } from '@/components/loaders/app-loader';
import { queryClient } from '@/api/queryClient';
import { getInitialAuthState } from '@/api/auth';

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

export const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPendingComponent: AppLoading,
    context: {
        queryClient,
        auth: {
            isAuthenticated: getInitialAuthState(),
            isLoading: false,
            login: () => { },
            logout: () => { },
        },
    },
})

