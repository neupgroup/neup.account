'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logoutActiveSession } from '@/core/auth/logout';
import { redirectInApp } from '@/core/helper/navigation';

// 7 minutes 30 seconds in milliseconds
const INACTIVITY_LIMIT_MS = 7 * 60 * 1000 + 30 * 1000;

export function InactivityMonitor() {
    const router = useRouter();
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleLogout = useCallback(async () => {
        // Clear the timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }

        // Clear client-side session data
        if (typeof window !== 'undefined') {
            sessionStorage.clear();
            // Also clear any local storage if used, though sessionStorage is the primary one mentioned
            localStorage.clear();
        }

        // Clear server-side session data (cookies)
        try {
            await logoutActiveSession();
        } catch (error) {
            // Ignore error if logout fails (e.g. network), we still want to redirect
            console.error("Logout failed", error);
        }

        // Redirect to start page with error message
        // preventing console logging or visible timers is handled by using internal setTimeout
        redirectInApp(router, '/auth/start?error=inactivity&error_description=Signed+Out+because+of+Inactvity');
    }, [router]);

    const resetTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        // Set new timer
        timerRef.current = setTimeout(handleLogout, INACTIVITY_LIMIT_MS);
    }, [handleLogout]);

    useEffect(() => {
        // Events to listen for
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

        // Initial timer start
        resetTimer();

        // Attach listeners
        const onEvent = () => resetTimer();

        events.forEach(event => {
            document.addEventListener(event, onEvent);
        });

        return () => {
            // Cleanup
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            events.forEach(event => {
                document.removeEventListener(event, onEvent);
            });
        };
    }, [resetTimer]);

    return null; // This component renders nothing
}
