import type { Metadata } from 'next';
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { ListItem } from "@/components/ui/list-item";
import { Bot } from "@/components/icons";
import { formMetadata } from '@/core/metadata';

export const metadata: Metadata = formMetadata({ title: 'Link Other Accounts' });

type PageProps = {
    searchParams: Promise<{ selectedProfile?: string; mode?: string; workingProfile?: string }>;
};

function buildAccessHref(pathname: string, context: { selectedProfile?: string; mode?: string; workingProfile?: string }) {
    const [basePathname, query = ''] = pathname.split('?', 2);
    const params = new URLSearchParams(query);

    if (context.selectedProfile) params.set('selectedProfile', context.selectedProfile);
    if (context.mode) params.set('mode', context.mode);
    if (context.workingProfile) params.set('workingProfile', context.workingProfile);

    const nextQuery = params.toString();
    return nextQuery ? `${basePathname}?${nextQuery}` : basePathname;
}

export default async function LinkAccountsPage({ searchParams }: PageProps) {
    const { selectedProfile, mode, workingProfile } = await searchParams;
    const hrefContext = { selectedProfile, mode, workingProfile };

    return (
        <div className="grid gap-8">
            <BackButton href={buildAccessHref('/access', hrefContext)} />
            <PrimaryHeader
                title="Link Other Accounts"
                description="Connect your accounts from other platforms to NeupID for a seamless experience."
            />
            <Card>
                <CardContent className="p-0 divide-y">
                    <ListItem
                        icon={Bot}
                        title="Link WhatsApp Account"
                        description="Connect your WhatsApp for notifications and services."
                        href={buildAccessHref('/access/link/whatsapp', hrefContext)}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
