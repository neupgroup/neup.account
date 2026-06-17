import { FlowLink } from '@/components/ui/flow-link';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getActiveAccountId } from '@/core/auth/verify';
import { getBranches } from "@/services/manage/accounts/branches";
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
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { LINKED_ACCOUNT_PERMISSION_GROUPS } from '@/core/auth/linked-account-permissions';

export default async function BrandBranchPage() {
    await requireAnyPermission404(LINKED_ACCOUNT_PERMISSION_GROUPS.brand);
    const brandId = await getActiveAccountId();

    if (!brandId) {
        notFound();
    }
    
    const branches = await getBranches(brandId);

    return (
        <div className="grid gap-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Manage Branches</h1>
                <p className="text-muted-foreground">
                    Oversee and configure your brand&apos;s various branches or locations.
                </p>
            </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Your Branches</CardTitle>
                        <CardDescription>
                            A list of all sub-brands or locations under this brand account.
                        </CardDescription>
                    </div>
                    <Button asChild>
                        <FlowLink href="/access/createAccount?type=branch"><Plus className="mr-2 h-4 w-4" />Create New Branch</FlowLink>
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Branch Name</TableHead>
                                <TableHead>NeupID</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {branches.length > 0 ? (
                                branches.map((branch) => (
                                    <TableRow key={branch.id}>
                                        <TableCell className="font-medium">{branch.name}</TableCell>
                                        <TableCell className="font-mono text-xs">{branch.neupId}</TableCell>
                                        <TableCell>{branch.location || 'N/A'}</TableCell>
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
                                            <h3 className="text-lg font-semibold">No Branches Found</h3>
                                            <p className="text-sm text-muted-foreground">
                                                Get started by creating your first branch account.
                                            </p>
                                             <Button asChild>
                                                <FlowLink href="/access/createAccount?type=branch"><Plus className="mr-2 h-4 w-4" />Create Branch</FlowLink>
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
