import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { AuthenticatedShell } from '@/components/layout/AuthenticatedShell';

export interface RouterContext {
  queryClient: QueryClient;
  auth: {
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
    isLoading: boolean;
  };
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => {
    const { auth } = Route.useRouteContext();

    if (auth.isAuthenticated) {
      return <AuthenticatedShell />;
    }

    return (
      <div className="h-screen w-screen overflow-hidden bg-background">
        <Outlet />
      </div>
    );
  },
});
