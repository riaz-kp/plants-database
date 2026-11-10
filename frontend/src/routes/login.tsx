import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginPage as OriginalLoginPage } from '@/components/auth/LoginPage';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({
        to: (search as any).redirect || '/',
        replace: true,
      });
    }
  },
  component: LoginWrapper,
});

function LoginWrapper() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = Route.useNavigate();
  const search = Route.useSearch() as { redirect?: string };

  useEffect(() => {
    if (isAuthenticated) {
      if (search.redirect) {
        navigate({ to: search.redirect as any, replace: true });
      } else {
        navigate({ to: '/', replace: true });
      }
    }
  }, [isAuthenticated, navigate, search.redirect]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <OriginalLoginPage />;
}
