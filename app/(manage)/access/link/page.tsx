import type { Metadata } from 'next';
import { Card, CardContent } from "#/components/ui/card";
import { BackButton } from "#/components/ui/back-button";
import { PrimaryHeader } from "#/components/ui/primary-header";
import { ListItem } from "@/components/ui/ListItem";
import { Bot, Github } from "@/components/icons";
import { formMetadata } from '#/core/metadata';
import { Badge } from '#/components/ui/badge';
import { FlowLink } from '#/components/ui/flow-link';
import { ChevronRight } from '@/components/icons';
import { formatReadableDateTime } from '#/core/helpers/date';
import { getLatestLinkedAccount } from '@/services/bridge/linked-accounts';

export const metadata: Metadata = formMetadata({ title: 'Link Other Accounts' });

type PageProps = {
    searchParams: Promise<{ selectedProfile?: string; mode?: string; workingProfile?: string }>;
};

function ConnectedGitHubListItem({
    href,
    accountLabel,
    connectedOn,
}: {
    href: string;
    accountLabel: string | null;
    connectedOn: Date;
}) {
    const title = accountLabel
        ? `Connected to ${accountLabel}`
        : 'Connected to GitHub account';

    return (
        <FlowLink href={href} className="block transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-4 px-4 py-4">
                <Github className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-grow">
                    <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{title}</p>
                        <Badge type="outlined" className="text-[10px] uppercase tracking-wide">Connected</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Linked on {formatReadableDateTime(connectedOn)}. Select to reconnect or refresh this link.
                    </p>
                </div>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </div>
        </FlowLink>
    );
}

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
    const githubLinkHref = buildAccessHref('/access/link/github', hrefContext);
    const githubLinkedAccount = selectedProfile
        ? await getLatestLinkedAccount(selectedProfile, 'github')
        : null;

    return (
        <div className="grid gap-8">
            <BackButton href={buildAccessHref('/access', hrefContext)} />
            <PrimaryHeader
                title="Link Other Accounts"
                description="Connect your accounts from other platforms to NeupID for a seamless experience."
            />
            <Card>
                <CardContent className="p-0 divide-y">
                    {githubLinkedAccount ? (
                        <ConnectedGitHubListItem
                            href={githubLinkHref}
                            accountLabel={githubLinkedAccount.accountLabel}
                            connectedOn={githubLinkedAccount.createdOn}
                        />
                    ) : (
                        <ListItem
                            icon={Github}
                            title="Link GitHub Account"
                            description="Connect to GitHub now."
                            href={githubLinkHref}
                        />
                    )}
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
