import { FlowLink } from '@/components/ui/flow-link';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDependentAccounts } from "@/services/manage/accounts/dependent";
import { User, Plus } from "lucide-react";
import { AccountListItem } from "@/components/elements/account-item";
import { BackButton } from "@/components/ui/back-button";
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS } from '@/neup.core/auth/access-view-permissions';
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
    permission('access.linked_account.view.self', 'for_individual', 'page'),
];

export default async function DependentAccountsPage() {
    await requireAnyPermission404([...ACCESS_LINKED_ACCOUNT_VIEW_PERMISSIONS]);

    const dependentAccounts = await getDependentAccounts();

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
            <BackButton href="/access" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Manage Dependent Accounts</h1>
                <p className="text-muted-foreground">
                    Oversee and manage accounts under your care.
                </p>
            </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Your Dependents</CardTitle>
                        <CardDescription>
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
                            <h3 className="text-lg font-semibold">No Dependent Accounts Found</h3>
                            <p className="text-sm text-muted-foreground">
                                Get started by creating an account for a family member.
                            </p>
                        </div>
                    )}
                </CardContent>
                <CardContent className="pt-6 border-t">
                    <Button asChild>
                        <FlowLink href="/access/createAccount?type=dependent"><Plus className="mr-2 h-4 w-4" />Create New Dependent</FlowLink>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
