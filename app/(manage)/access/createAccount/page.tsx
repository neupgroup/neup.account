import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { permission } from '@/.neup/logica/permission';
import CreateBrandPageClient from './brand-page-client';
import CreateDependentPageClient from './dependent-page-client';
import CreateSubbrandPageClient from './subbrand-page-client';
import { formMetadata } from '#/core/metadata';
import { resolveAccessProfileContext } from '@/services/account/access-profile-context';
import { getUserProfile } from '@/services/user';
import {
    ACCESS_ACCOUNT_BRAND_CREATE_PERMISSIONS,
    ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS,
} from '@/inapp/permissions/access-view-permissions';

const pagePermissions = [
    permission('access.account.brand.create.self', 'for_individual', 'page'),
    permission('access.account.dependent.create.self', 'for_individual', 'page'),
    permission('linked_accounts.brand.manage', 'for_brand', 'page'),
];

type PageProps = {
    searchParams: Promise<{ type?: string; selectedProfile?: string; mode?: string; workingProfile?: string }>;
};

function buildAccessHref(
    pathname: string,
    context: { selectedProfile?: string; mode?: string; workingProfile?: string },
) {
    const [basePathname, query = ''] = pathname.split('?', 2);
    const params = new URLSearchParams(query);

    if (context.selectedProfile) params.set('selectedProfile', context.selectedProfile);
    if (context.mode) params.set('mode', context.mode);
    if (context.workingProfile) params.set('workingProfile', context.workingProfile);

    const nextQuery = params.toString();
    return nextQuery ? `${basePathname}?${nextQuery}` : basePathname;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const { type } = await searchParams;

    if (type === 'brand' || type === 'dependent' || type === 'subbrand' || type === 'branch') {
        return formMetadata({ title: 'Create Account' });
    }

    return formMetadata({ title: 'Access & Control' });
}

export default async function CreateAccountPage({ searchParams }: PageProps) {
    const { type, selectedProfile, mode, workingProfile } = await searchParams;
    const requiredPermissions =
        type === 'brand'
            ? ACCESS_ACCOUNT_BRAND_CREATE_PERMISSIONS
            : type === 'dependent'
                ? ACCESS_ACCOUNT_DEPENDENT_CREATE_PERMISSIONS
                : type === 'subbrand' || type === 'branch'
                    ? (['linked_accounts.brand.manage'] as const)
                    : null;

    if (!requiredPermissions) {
        notFound();
    }

    const accessContext = await resolveAccessProfileContext({
        selectedProfile,
        workingProfile,
        requiredPermissions,
    });

    if (!accessContext) {
        notFound();
    }

    const hrefContext = {
        selectedProfile: accessContext.selectedProfile,
        mode,
        workingProfile,
    };
    const backHref = buildAccessHref('/access', hrefContext);

    if (type === 'brand') {
        return (
            <CreateBrandPageClient
                managerAccountId={accessContext.selectedProfile}
                backHref={backHref}
            />
        );
    }

    if (type === 'dependent') {
        return (
            <CreateDependentPageClient
                managerAccountId={accessContext.selectedProfile}
                backHref={backHref}
            />
        );
    }

    if (type === 'subbrand' || type === 'branch') {
        const managerProfile = await getUserProfile(accessContext.selectedProfile);
        if (managerProfile?.accountType !== 'brand' && managerProfile?.accountType !== 'subbrand') {
            notFound();
        }

        return (
            <CreateSubbrandPageClient
                managerAccountId={accessContext.selectedProfile}
                backHref={backHref}
            />
        );
    }

    notFound();
}
