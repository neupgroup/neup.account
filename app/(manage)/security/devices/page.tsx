import { permission } from '@neup/logica/permission';
import {
    Card,
} from "@neup/components/ui/card";
import { getUserSessions } from "@/services/security/sessions";
import { SessionManager } from "@/app/(manage)/security/session-manager";
import { getActiveSession } from '@/services/account/verify';
import { BackButton } from "@neup/components/element/backButton";
import { TitleSet } from '@neup/components/element/titleset';
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
            <BackButton backsTo="/manage/security" />
            <TitleSet level={1}
                title="Your Devices"
                subtitle="A list of devices that have been used to sign in to your account."
                titleClassName="text-2xl leading-8"
                subtitleClassName="text-sm leading-6"
            />
            <div className="space-y-2">
                <TitleSet level={2}
                    title="Session Management"
                    subtitle="You can sign out any session you don't recognize."
                    titleClassName="text-lg leading-7"
                    subtitleClassName="text-sm leading-6"
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
