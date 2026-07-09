'use client';

import { useSession } from "@/core/providers/session";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { redirectInApp } from "@/core/helpers/navigation";

/**
 * ::neup.documentation::auth-proxy-component
 * ::title Auth Proxy Component
 *
 * Client-side redirect helper for authenticated dashboard routes.
 *
 * ::public
 *
 * Use this component inside server-guarded authenticated layouts to redirect
 * invalid client sessions without blocking server-rendered page content while
 * the browser refreshes session state.
 *
 * ::public end
 *
 * ::private
 *
 * The enclosing dashboard layout calls `requireValidSession()` before this
 * component renders, so this proxy must not hide children during the client
 * session loading phase. Hiding children here makes direct query-parameter
 * pages appear blank until a previous client page has hydrated session state.
 *
 * ::private end
 *
 * ::end
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

    return <>{children}</>;
}
