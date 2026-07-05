import type { Metadata } from 'next';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Ban } from 'lucide-react';
import { getExpiredGuestAccounts } from '@/services/manage/accounts/cleanup';
import { CleanupClient } from './cleanup-client';
import { createPageMetadata } from '@/neup.core/metadata';

export const metadata: Metadata = createPageMetadata('Accounts Cleanup');

export default async function AccountCleanupPage() {
    const { accounts, error } = await getExpiredGuestAccounts();

    return (
        <div className="grid gap-8">
            <div className="space-y-4">
                <BackButton href="/manage/accounts" />
                <PrimaryHeader
                    title="Account Cleanup"
                    description="Permanently delete expired guest accounts and all their associated data."
                />
            </div>

            {error ? (
                <Alert variant="destructive">
                    <Ban className="h-4 w-4" />
                    <AlertTitle>Permission Denied</AlertTitle>
                    <AlertDescription>
                        You do not have permission to perform account cleanup.
                    </AlertDescription>
                </Alert>
            ) : (
                <CleanupClient initialAccounts={accounts} />
            )}
        </div>
    );
}
