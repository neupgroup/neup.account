import { FlowLink } from '@/components/flow-link';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@neup/components/ui/card";
import { Button } from "@neup/components/ui/button";
import { getDependentAccounts } from "@/services/manage/accounts/dependent";
import { User, Plus } from "lucide-react";
import { AccountListItem } from "@/components/elements/account-item";
import { BackButton } from "@neup/components/element/backButton";
import { requireAnyPermission404 } from '@/services/account/permission-guards';
import { ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS } from '@/inapp/permissions/access-view-permissions';
import { permission } from '@neup/logica/permission';

const pagePermissions = [
    permission('access.linked_account.view.self', 'for_individual', 'page'),
];

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

export default async function DependentAccountsPage({ searchParams }: PageProps) {
    const { selectedProfile, mode, workingProfile } = await searchParams;
    await requireAnyPermission404([...ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS]);

    const dependentAccounts = await getDependentAccounts();
    const hrefContext = { selectedProfile, mode, workingProfile };

    const mappedAccounts = dependentAccounts.map(acc => ({
        aid: acc.id,
        def: 0 as const,
        sid: '',
        skey: '',
        displayName: acc.nameDisplay || '',
        neupId: acc.neupId || '',
        displayPhoto: acc.accountPhoto || '',
        isDependent: true,
    }));

    return (
        <div className="grid gap-8">
            <BackButton backsTo="/access" />
            <div>
                <h1 className="font-bold tracking-tight text-2xl leading-8">Manage Dependent Accounts</h1>
                <p className="text-muted-foreground text-sm leading-6">
                    Oversee and manage accounts under your care.
                </p>
            </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg leading-7">Your Dependents</CardTitle>
                        <CardDescription className="text-sm leading-6">
                            A list of all accounts you manage.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0 divide-y">
                    {mappedAccounts.length > 0 ? (
                        mappedAccounts.map(acc => (
                            <AccountListItem key={acc.aid} account={acc} />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                            <User className="h-12 w-12 text-muted-foreground/50" />
                            <h3 className="font-semibold text-lg leading-7">No Dependent Accounts Found</h3>
                            <p className="text-muted-foreground text-sm leading-6">
                                Get started by creating an account for a family member.
                            </p>
                        </div>
                    )}
                </CardContent>
                <CardContent className="pt-6 border-t">
                    <Button asChild>
                        <FlowLink href={buildAccessHref('/access/createAccount?type=dependent', hrefContext)}><Plus className="mr-2 h-4 w-4" />Create New Dependent</FlowLink>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
