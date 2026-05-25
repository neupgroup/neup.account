
import {
    Card,
} from "@/components/ui/card";
import { getUserSessions } from "@/services/security/sessions";
import { SessionManager } from "@/app/(manage)/security/session-manager";
import { getActiveSession } from '@/core/auth/verify';
import { BackButton } from "@/components/ui/back-button";
import { checkPermissions } from '@/services/user';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Ban } from "lucide-react";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { SecondaryHeader } from "@/components/ui/secondary-header";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function DevicesPage() {
    const hasPermission = await checkPermissions(['security.login_devices.view']);

    if (!hasPermission) {
        return notFound();
    }

    const [sessions, activeSession] = await Promise.all([
        getUserSessions(),
        getActiveSession()
    ]);
    const currentSessionId = activeSession?.sessionId || null;


    return (
        <div className="grid gap-8">
            <BackButton href="/manage/security" />
            <PrimaryHeader
                title="Your Devices"
                description="A list of devices that have been used to sign in to your account."
            />
            <div className="space-y-2">
                <SecondaryHeader
                    title="Session Management"
                    description="You can sign out any session you don't recognize."
                />
                <Card>
                    <SessionManager
                        initialSessions={sessions}
                        currentSessionId={currentSessionId}
                    />
                </Card>
            </div>
        </div>
    )
}
