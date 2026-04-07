import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { AlertProvider } from './contexts/AlertContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { queryClient } from './api/queryClient';
import { router } from './router';
import './App.css';

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth, queryClient }} />;
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
