import { Link, useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, ListTree, Tags, Leaf, FolderKanban, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib-frontend/utils';

const NAV_GROUPS = [
    {
        label: null,
        items: [
            { to: '/', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/projects', label: 'Projects', icon: FolderKanban },
        ],
    },
    {
        label: 'Catalog',
        items: [
            { to: '/plants', label: 'Plants', icon: Leaf },
            { to: '/categories', label: 'Categories', icon: Tags },
            { to: '/taxonomy', label: 'Taxonomy', icon: ListTree },
        ],
    },
] as const;

export function SidebarContent({ onClose }: { onClose?: () => void }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground overflow-hidden">
            {/* Brand: the full-colour mark on a cream tile, as in the logo */}
            <Link to="/" onClick={onClose} className="flex items-center gap-3 px-5 h-16 shrink-0">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-background shadow-sm shrink-0">
                    <img src="/logo-color.svg" alt="" className="w-7 h-7" />
                </span>
                <span className="min-w-0">
                    <span className="wordmark block text-[15px] leading-tight text-sidebar-active-foreground">
                        Landschaft
                    </span>
                    <span className="block text-[11px] leading-tight text-sidebar-foreground/70">Plants Database</span>
                </span>
            </Link>

            <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-4 space-y-6 border-t border-white/[0.08]">
                {NAV_GROUPS.map((group, i) => (
                    <div key={i}>
                        {group.label && (
                            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                                {group.label}
                            </p>
                        )}
                        <div className="space-y-1">
                            {group.items.map(({ to, label, icon: Icon }) => (
                                <Link
                                    key={to}
                                    to={to}
                                    onClick={onClose}
                                    activeOptions={{ exact: to === '/' }}
                                    className="group relative flex items-center gap-3 h-10 px-3 rounded-lg text-sm transition-colors"
                                    activeProps={{ className: 'bg-sidebar-active text-sidebar-active-foreground font-medium' }}
                                    inactiveProps={{ className: 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-active-foreground' }}
                                >
                                    {({ isActive }) => (
                                        <>
                                            {isActive && (
                                                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" />
                                            )}
                                            <Icon
                                                className={cn(
                                                    'w-[18px] h-[18px] shrink-0 transition-colors',
                                                    isActive ? 'text-accent' : 'text-sidebar-foreground/70 group-hover:text-sidebar-active-foreground',
                                                )}
                                            />
                                            {label}
                                        </>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="px-3 pt-3 pb-4 border-t border-white/[0.08] shrink-0">
                <button
                    onClick={() => {
                        logout();
                        onClose?.();
                        navigate({ to: '/login' });
                    }}
                    className="group flex w-full items-center gap-3 h-10 px-3 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-active-foreground transition-colors"
                >
                    <LogOut className="w-[18px] h-[18px] shrink-0 text-sidebar-foreground/70 group-hover:text-sidebar-active-foreground transition-colors" />
                    Log out
                </button>
                <p className="px-3 mt-2 text-[11px] text-sidebar-foreground/40">v1.0.0-beta</p>
            </div>
        </div>
    );
}
