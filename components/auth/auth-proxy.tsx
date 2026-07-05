'use client';

import { useSession } from "@/neup.core/providers/session";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { redirectInApp } from "@/neup.core/helper/navigation";

/**
 * AuthProxy handles the authentication check and redirection logic.
 * It ensures that children (and the layout wrapping them) are only
 * visible after the authentication check has been successfully completed.
 * 
 * This component acts as a "proxy" to guard protected routes without
 * relying on Next.js middleware, which the user prefers to avoid.
 */
export function AuthProxy({ children }: { children: React.ReactNode }) {
    const { loading, profile } = useSession();
    const router = useRouter();

    useEffect(() => {
        // Redirect if not logged in.
        // Since this component is used within the (manage) layout,
        // we assume all routes it wraps require authentication.
        if (!loading && !profile) {
            redirectInApp(router, '/auth/start');
        }
    }, [loading, profile, router]);

    // If still loading or not authenticated, render nothing to hide the layout
    if (loading || !profile) {
        return null;
    }

    // Only render children if authenticated
    return <>{children}</>;
}
