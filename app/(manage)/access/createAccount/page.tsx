import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { permission } from '@/logica/permission';
import CreateBrandPageClient from './brand-page-client';
import CreateDependentPageClient from './dependent-page-client';
import CreateSubbrandPageClient from './subbrand-page-client';
import { createPageMetadata } from '@/core/metadata';
import {
    ACCESS_ACCOUNT_BRAND_CREATE_PERMISSIONS,
    ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS,
} from '@/core/auth/access-view-permissions';

const pagePermissions = [
    permission('access.account.brand.create.self', 'for_individual', 'page'),
    permission('access.account.dependent.create.self', 'for_individual', 'page'),
    permission('linked_accounts.brand.manage', 'for_brand', 'page'),
];

type PageProps = {
    searchParams: Promise<{ type?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const { type } = await searchParams;

    if (type === 'brand' || type === 'dependent' || type === 'subbrand' || type === 'branch') {
        return createPageMetadata('Create Account');
    }

    return createPageMetadata('Access & Control');
}

export default async function CreateAccountPage({ searchParams }: PageProps) {
    const { type } = await searchParams;

    if (type === 'brand') {
        await requireAnyPermission404([...ACCESS_ACCOUNT_BRAND_CREATE_PERMISSIONS]);
        return <CreateBrandPageClient />;
    }

    if (type === 'dependent') {
        await requireAnyPermission404([...ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS]);
        return <CreateDependentPageClient />;
    }

    if (type === 'subbrand' || type === 'branch') {
        await requireAnyPermission404(['linked_accounts.brand.manage']);
        return <CreateSubbrandPageClient />;
    }

    notFound();
}
