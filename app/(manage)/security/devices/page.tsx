import { permission } from '@/logica/permission';
import {
    Card,
} from "@/components/ui/card";
import { getUserSessions } from "@/services/security/sessions";
import { SessionManager } from "@/app/(manage)/security/session-manager";
import { getActiveSession } from '@/services/account/verify';
import { BackButton } from "@/components/ui/back-button";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { SecondaryHeader } from "@/components/ui/secondary-header";
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { SECURITY_PERMISSION_GROUPS } from '@/inapp/permissions/security-permissions';

export const dynamic = 'force-dynamic';

const pagePermissions = [
    permission('security.login_devices.view.self', 'for_individual', 'page'),
];

export default async function DevicesPage() {
    await requireAnyPermission404(SECURITY_PERMISSION_GROUPS.devices);

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
