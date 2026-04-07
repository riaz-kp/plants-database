import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { AlertProvider } from './contexts/AlertContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { routeTree } from './routeTree.gen';
import './App.css';

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: {
    queryClient,
    auth: undefined as any, // provided exactly by AuthProvider below
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth }} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AlertProvider>
          <ConfirmProvider>
            <InnerApp />
          </ConfirmProvider>
        </AlertProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
