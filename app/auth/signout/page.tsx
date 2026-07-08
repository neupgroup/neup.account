
"use client"

import { useEffect, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { logoutActiveSession } from "@/core/auth/logout"
import { redirectInApp } from "@/core/helpers/link"

function SignOut() {
    const searchParams = useSearchParams()
    const formRef = useRef<HTMLFormElement>(null)

    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.clear();
        }

        const timer = setTimeout(() => {
            if (formRef.current) {
                formRef.current.requestSubmit();
            }
        }, 0);

        return () => clearTimeout(timer);
    }, [])

    const handleSignOut = async () => {
        try {
            await logoutActiveSession()
        } catch (error) {
            console.error("Sign-out failed:", error)
        } finally {
            const errorParam = searchParams.get('error');
            const errorDescParam = searchParams.get('error_description');

            if (errorParam) {
                redirectInApp(`/auth/start?error=${errorParam}&error_description=${errorDescParam || 'Please sign in again.'}`, null, { hard: true });
            } else {
                redirectInApp('/auth/start', null, { hard: true });
            }
        }
    }

    return (
        <form ref={formRef} action={handleSignOut} className="hidden">
            <button type="submit">Signing out...</button>
        </form>
    )
}

export default function SignOutPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SignOut />
        </Suspense>
    )
}
