import { createFileRoute } from '@tanstack/react-router';
import { LoginPage as OriginalLoginPage } from '@/components/auth/LoginPage';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export const Route = createFileRoute('/login')({
  component: LoginWrapper,
});

function LoginWrapper() {
  const { isAuthenticated } = useAuth();
  const navigate = Route.useNavigate();
  const search = Route.useSearch() as { redirect?: string };

  useEffect(() => {
    if (isAuthenticated) {
      if (search.redirect) {
        // Simple fallback vs full parsing for demo
        navigate({ to: search.redirect as any, replace: true });
      } else {
        navigate({ to: '/', replace: true });
      }
    }
  }, [isAuthenticated, navigate, search.redirect]);

  return <OriginalLoginPage />;
}
