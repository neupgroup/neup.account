import type { Metadata } from 'next';
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { PrimaryHeader } from "@/components/ui/primary-header";
import { ListItem } from "@/components/ui/list-item";
import { Bot } from "@/components/icons";
import { createPageMetadata } from '@/core/metadata';

export const metadata: Metadata = createPageMetadata('Link Other Accounts');

export default function LinkAccountsPage() {
    return (
        <div className="grid gap-8">
            <BackButton href="/access" />
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
                        href="/access/link/whatsapp"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
