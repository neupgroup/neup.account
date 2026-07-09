"use client";

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from './button';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { redirectInApp } from '@/core/helpers/navigation';

const ERROR_MESSAGES: Record<string, string> = {
    session_expired: "Your session has expired. Please sign in again.",
    unauthenticated: "No active user session found. Please sign in to continue.",
    invalid_request: 'The authentication request was invalid.',
    missing_app_id: 'The application ID is missing from the request.',
    internal_server_error: 'An unexpected server error occurred. Please try again.',
};

export function UrlErrorBanner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [description, setDescription] = useState<string | null>(null);

    useEffect(() => {
        const errorKey = searchParams.get('error');
        const errorDesc = searchParams.get('error_description');

        if (errorKey) {
            setError(errorKey);
            setDescription(errorDesc || ERROR_MESSAGES[errorKey] || "An unknown error occurred.");
        } else {
            setError(null);
            setDescription(null);
        }
    }, [searchParams]);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                handleClose();
            }, 15000); // 15 seconds
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleClose = () => {
        setError(null);
        setDescription(null);
        // Clean up URL
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.delete('error');
        newParams.delete('error_description');
        redirectInApp(router, `?${newParams.toString()}`, { replace: true, scroll: false });
    };

    return (
        <AnimatePresence>
            {error && (
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="fixed bottom-0 left-0 right-0 z-[101] p-4"
                >
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-background rounded-lg border shadow-2xl flex items-center justify-between gap-4 p-4">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" />
                                <div>
                                    <h3 className="font-semibold">An Error Occurred</h3>
                                    <p className="text-sm text-muted-foreground">{description}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleClose}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
