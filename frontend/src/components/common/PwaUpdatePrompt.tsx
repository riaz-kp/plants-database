import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

// The browser only looks for a new service worker when a page loads, so an installed
// app left open for days would never notice a deploy without this check
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        // Register after the page has loaded, so precaching doesn't compete with the first load
        immediate: false,
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;
            // A failed check (e.g. offline) is simply retried next time
            setInterval(() => registration.update().catch(() => { }), UPDATE_CHECK_INTERVAL_MS);
        },
    });

    if (!needRefresh) return null;

    // z-[60] sits above the bottom bars (z-50) but under dialogs, so it waits until a dialog is closed
    return (
        <div
            role="status"
            className="fixed z-[60] bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 flex items-center gap-3 rounded-xl border border-border bg-white p-4 shadow-lg"
        >
            <p className="flex-1 text-sm text-foreground">A new version of Landschaft is available.</p>
            <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
                Later
            </Button>
            <Button size="sm" onClick={() => updateServiceWorker()}>
                Reload
            </Button>
        </div>
    );
}
