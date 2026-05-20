

'use client';

import React from "react"
import { DashboardNav } from "@/components/dashboard-nav"
import { AuthProxy } from "@/components/auth/auth-proxy"

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <AuthProxy>
            <div className="w-full bg-background text-foreground">
                <div className="mx-auto grid w-full max-w-[1440px] lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr]">
                    <aside className="hidden h-[calc(100vh-4rem)] flex-col border-r lg:sticky lg:top-16 lg:flex">
                        <div className="flex flex-1 flex-col overflow-y-auto p-4">
                            <DashboardNav />
                        </div>
                    </aside>
                    <main className="min-h-[calc(100vh-4rem)] p-6 lg:p-8">
                        <div className="w-full">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </AuthProxy>
    );
}


export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <DashboardLayoutContent>{children}</DashboardLayoutContent>
}
