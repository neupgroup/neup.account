import { FlowLink } from '@/components/ui/flow-link';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getActiveAccountId } from '@/neup.core/auth/verify';
import { getSubbrands } from "@/services/manage/accounts/subbrands";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Building, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAnyPermission404 } from '@/neup.core/auth/permission-guards';
import { LINKED_ACCOUNT_PERMISSION_GROUPS } from '@/neup.core/auth/linked-account-permissions';
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
    permission('access.linked_account.view.self', 'for_individual', 'page'),
    permission('access.account.brand.create.self', 'for_individual', 'page'),
    permission('access.accounts.switch.self', 'for_individual', 'page'),
    permission('linked_accounts.brand.manage', 'for_brand', 'page'),
    permission('linked_accounts.brand.manager', 'for_brand', 'page'),
];

export default async function BrandSubbrandPage() {
    await requireAnyPermission404(LINKED_ACCOUNT_PERMISSION_GROUPS.brand);
    const brandId = await getActiveAccountId();

    if (!brandId) {
        notFound();
    }
    
    const subbrands = await getSubbrands(brandId);

    return (
        <div className="grid gap-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Manage Subbrands</h1>
                <p className="text-muted-foreground">
                    Oversee and configure your brand&apos;s subbrands or locations.
                </p>
            </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Your Subbrands</CardTitle>
                        <CardDescription>
                            A list of all sub-brands or locations under this brand account.
                        </CardDescription>
                    </div>
                    <Button asChild>
                        <FlowLink href="/access/createAccount?type=subbrand"><Plus className="mr-2 h-4 w-4" />Create New Subbrand</FlowLink>
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Subbrand Name</TableHead>
                                <TableHead>NeupID</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {subbrands.length > 0 ? (
                                subbrands.map((subbrand) => (
                                    <TableRow key={subbrand.id}>
                                        <TableCell className="font-medium">{subbrand.name}</TableCell>
                                        <TableCell className="font-mono text-xs">{subbrand.neupId}</TableCell>
                                        <TableCell>{subbrand.location || 'N/A'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm">Manage</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4}>
                                        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                                            <Building className="h-12 w-12 text-muted-foreground/50" />
                                            <h3 className="text-lg font-semibold">No Subbrands Found</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Get started by creating your first subbrand account.
                                            </p>
                                             <Button asChild>
                                                <FlowLink href="/access/createAccount?type=subbrand"><Plus className="mr-2 h-4 w-4" />Create Subbrand</FlowLink>
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
