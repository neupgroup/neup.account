import { notFound } from 'next/navigation';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import CreateBrandPageClient from './brand-page-client';
import CreateDependentPageClient from './dependent-page-client';
import CreateBranchPageClient from './branch-page-client';

type PageProps = {
    searchParams: Promise<{ type?: string }>;
};

export default async function CreateAccountPage({ searchParams }: PageProps) {
    const { type } = await searchParams;

    if (type === 'brand') {
        await requireAnyPermission404(['linked_accounts.brand.create']);
        return <CreateBrandPageClient />;
    }

    if (type === 'dependent') {
        await requireAnyPermission404(['linked_accounts.dependent.create']);
        return <CreateDependentPageClient />;
    }

    if (type === 'branch') {
        await requireAnyPermission404(['linked_accounts.brand.manage']);
        return <CreateBranchPageClient />;
    }

    notFound();
}
