import { Link, useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, ListTree, Tags, Leaf, FolderKanban, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Separator } from '@/components/ui/separator';

const NAV_ITEMS = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/taxonomy', label: 'Taxonomy', icon: ListTree },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/plants', label: 'Plants', icon: Leaf },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
];

export function SidebarContent({ onClose }: { onClose?: () => void }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="flex flex-col h-full bg-[#1F4D2E] text-white overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-5 h-16 shrink-0">
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
                        activeProps={{ className: 'bg-white text-[#1F4D2E]' }}
                        inactiveProps={{ className: 'text-white/70 hover:text-white hover:bg-white/10' }}
                    >
                        <Icon className="w-4 h-4 shrink-0" />
                        {label}
                    </Link>
                ))}
            </nav>

            <Separator className="bg-white/10 mx-4" />

            <div className="px-3 py-4 shrink-0">
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

            <div className="px-5 py-4 shrink-0">
                <p className="text-white/30 text-xs lowercase">v1.0.0-beta</p>
            </div>
        </div>
    );
}
