import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarContent } from './AppSidebar';
import { Link, Outlet } from '@tanstack/react-router';

export function AuthenticatedShell() {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background">
            <aside className="hidden lg:flex w-60 flex-col shrink-0">
                <SidebarContent />
            </aside>

            <div className="flex flex-col flex-1 min-w-0">
                <header className="lg:hidden relative flex items-center px-4 h-16 border-b border-border bg-white shrink-0">
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
                        <Link to="/" className="font-medium text-base text-[#1F4D2E] tracking-tight">
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
