import { createFileRoute, Outlet, redirect, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { LayoutDashboard, ListTree, Tags, Leaf, FolderKanban, Menu, LogOut } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

import { useAuth } from '@/contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/taxonomy', label: 'Taxonomy', icon: ListTree },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/plants', label: 'Plants', icon: Leaf },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { logout } = useAuth();
  const navigate = Route.useNavigate();

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'hsl(var(--sidebar))' }}>
      <div className="flex items-center gap-2 px-5 py-5">
        <img
          src="/logo.svg"
          alt="Landschaft"
          className="w-9 h-9 shrink-0"
          style={{ filter: 'brightness(0) invert(1) opacity(0.90)' }}
        />
        <span className="text-white font-semibold text-base tracking-wide uppercase">
          Landschaft
        </span>
      </div>

      <Separator className="bg-white/10 mx-4" />

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            activeProps={{ className: 'bg-white text-[hsl(var(--sidebar))]' }}
            inactiveProps={{ className: 'text-white/70 hover:text-white hover:bg-white/10' }}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <Separator className="bg-white/10 mx-4" />

      <div className="px-3 py-4">
        <button
          onClick={() => {
            logout();
            onClose?.();
            navigate({ to: '/login' });
          }}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Logout
        </button>
      </div>

      <div className="px-5 py-4">
        <p className="text-white/30 text-xs">Plants Database v1.0</p>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <aside className="hidden lg:flex w-60 min-w-[240px] flex-col shrink-0">
        <SidebarContent />
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="lg:hidden relative flex items-center px-4 py-3 border-b border-border bg-white">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-1 -m-1 rounded text-foreground hover:bg-muted">
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0 border-none">
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <Link to="/">
              <img
                src="/logo.svg"
                alt="Landschaft"
                className="w-7 h-7"
                style={{
                  filter: "brightness(0) saturate(100%) invert(18%) sepia(28%) saturate(1194%) hue-rotate(92deg) brightness(95%) contrast(90%)"
                }}
              />
            </Link>
            <Link to="/" className="font-medium text-base text-[#1F4D2E]">
              LANDSCHAFT
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      });
    }
  },
  component: AuthenticatedLayout,
});
