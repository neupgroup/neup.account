import { Card, CardContent } from "#/components/ui/card";
import React from "react";
import { permission } from "@/.neup/logica/permission";
import { getConnectedApplications } from "@/services/applications/connected";
import { ListItem } from "@/components/ui/ListItem";
import { SecondaryHeader } from "#/components/ui/secondary-header";
import { History, Trash2, PowerOff, CalendarClock, AppWindow, Share2, type LucideIcon } from "@/components/icons";
import { checkPermissions } from "@/services/user";
import { DATA_PRIVACY_PERMISSION_GROUPS } from "@/inapp/permissions/data-permissions";

const pagePermissions = [
    permission("data.delete_account.start", "for_individual", "page"),
    permission("data.deactivate_account.start", "for_individual", "page"),
    permission("data.materialization.view", "for_individual", "page"),
    permission("data.materialization.modify", "for_individual", "page"),
    permission("access.connection.view.self", "for_individual", "page"),
    permission("access.application.view.self", "for_individual", "page"),
    permission("security.recent_activities.view", "for_individual", "page"),
];

/**
 * ::neup.documentation::manage-data-page-client
 * ::title Data And Privacy Client Page
 *
 * Renders the account data-and-privacy dashboard with available privacy actions and connected apps.
 *
 * ::public
 *
 * The page shows only the privacy features the current account can access, plus first-party and third-party application connections when available.
 *
 * ::public end
 *
 * ::private
 *
 * Visibility is determined by runtime permission checks against the shared data-permission groups and the connected-application service.
 *
 * ::private end
 *
 * ::end
 */
export default async function DataAndPrivacyPage() {
    const [canViewDelete, canViewDeactivate, canViewMaterialization, canViewAppConnections, canViewActivity] = await Promise.all([
        checkPermissions(DATA_PRIVACY_PERMISSION_GROUPS.deleteAccount),
        checkPermissions(DATA_PRIVACY_PERMISSION_GROUPS.deactivateAccount),
        checkPermissions(DATA_PRIVACY_PERMISSION_GROUPS.materialization),
        checkPermissions(DATA_PRIVACY_PERMISSION_GROUPS.appConnections),
        checkPermissions(DATA_PRIVACY_PERMISSION_GROUPS.recentActivities),
    ]);

    const { firstParty, thirdParty } = canViewAppConnections ? await getConnectedApplications() : { firstParty: [], thirdParty: [] };

    const privacyFeatures: { icon: LucideIcon; title: string; description: string; href: string; allowed: boolean; }[] = [
         {
            icon: History,
            title: "Your Account Activity",
            description: "View a log of recent actions performed on your account.",
            href: "/data/activity",
            allowed: canViewActivity,
        },
        {
            icon: Trash2,
            title: "Delete Your Account",
            description: "Permanently delete your account and associated data.",
            href: "/data/delete",
            allowed: canViewDelete,
        },
        {
            icon: PowerOff,
            title: "Deactivate Your Account",
            description: "Temporarily deactivate your account.",
            href: "/data/deactivate",
            allowed: canViewDeactivate,
        },
        {
            icon: CalendarClock,
            title: "Schedule Deletion (Materialization)",
            description: "Request data deletion after a period of inactivity.",
            href: "/data/materialization",
            allowed: canViewMaterialization,
        },
        {
            icon: AppWindow,
            title: "Application Connections",
            description: "Manage your applications and connected application access.",
            href: "/data/appconnection",
            allowed: canViewAppConnections,
        },
    ].filter((feature) => feature.allowed);

    const appIconMap: Record<string, LucideIcon> = {
        'app-window': AppWindow,
        'building': AppWindow, // Placeholder
        'bar-chart': AppWindow, // Placeholder
        'share-2': Share2,
    };


    return (
        <div className="grid gap-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Your Data</h1>
                <p className="text-muted-foreground">
                    Manage and understand how your data is used across Neup services.
                </p>
            </div>
            
             <div className="space-y-2">
                <Card>
                    <CardContent className="divide-y p-2">
                        {privacyFeatures.map((feature, index) => (
                            <ListItem key={index} {...feature} />
                        ))}
                    </CardContent>
                </Card>
            </div>

            {firstParty.length > 0 && (
                <div className="space-y-2">
                    <SecondaryHeader 
                        title="Data within Neup Group"
                        description="Your data is shared across Neup Group services to provide a seamless experience. Review each service to understand how your data is used."
                    />
                    <Card>
                        <CardContent className="divide-y p-2">
                            {firstParty.map((app) => (
                                <ListItem 
                                    key={app.id}
                                    icon={app.icon ? appIconMap[app.icon] : AppWindow}
                                    title={app.name}
                                    description={app.description}
                                    href={`/data/1/${app.id}`} 
                                />
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}

            {thirdParty.length > 0 && (
                <div className="space-y-2">
                    <SecondaryHeader
                        title="Third-party Access"
                        description="Control how your data is accessed by other applications and services."
                    />
                    <Card>
                        <CardContent className="divide-y p-2">
                            {thirdParty.map((app) => (
                                <ListItem 
                                    key={app.id}
                                    icon={app.icon ? appIconMap[app.icon] : Share2}
                                    title={app.name}
                                    description={app.description}
                                    href={`/data/3/${app.id}`} 
                                />
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
