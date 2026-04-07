import { Loader2 } from "lucide-react";

export function AppLoading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f4f0ea]">
            <Loader2 className="h-8 w-8 animate-spin text-[#1F4D2E]" />
        </div>
    );
}
