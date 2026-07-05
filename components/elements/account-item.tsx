
"use client";

import { useEffect, useState, useTransition } from 'react';
import { getUserProfile } from '@/services/user';
import type { StoredAccount } from '@/neup.core/auth/session';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from '@/components/icons';
import { AccountActions } from '@/app/auth/start/start-page-component';
import { cn } from '@/neup.core/helpers/utils';
import { deleteSessionData } from '@/neup.core/auth/storage';

type CombinedAccount = StoredAccount & {
    displayName?: string;
    displayPhoto?: string;
    isUnknown?: boolean;
    isBrand?: boolean;
    isDependent?: boolean;
    accountType?: string;
};

export function AccountListItem({ account, isActive }: { account: CombinedAccount; isActive?: boolean }) {
    const [details, setDetails] = useState<Partial<CombinedAccount>>({
        displayName: account.displayName,
        neupId: account.nid || account.neupId,
        displayPhoto: account.displayPhoto || (account.isBrand ? 'https://neupgroup.com/assets/brand.png' : 'https://neupgroup.com/assets/user.png'),
    });
    const [loading, setLoading] = useState(true);
    const [isSwitching, startSwitchTransition] = useTransition();
    const router = useRouter();
    const searchParams = useSearchParams();
    const workingProfileId = searchParams.get('workingProfile');

    useEffect(() => {
        let isMounted = true;
        async function fetchAccountDetails() {
            const accountId = account.accountId || account.aid;
            if (!accountId || account.isUnknown) {
                if (isMounted) {
                    setDetails({ isUnknown: true, displayName: 'Unknown Account', neupId: 'unknown', displayPhoto: 'https://neupgroup.com/assets/user.png' });
                    setLoading(false);
                }
                return;
            }



            if (account.displayName) {
                if (isMounted) setLoading(false);
                return;
            }

            try {
                const profile = await getUserProfile(accountId);
                if (isMounted) {
                    setDetails({
                        displayName: profile?.nameDisplay || `Account ${accountId.substring(0, 6)}`,
                        neupId: account.nid || account.neupId || profile?.neupIdPrimary || 'N/A',
                        displayPhoto: profile?.accountPhoto || (profile?.accountType === 'brand' ? 'https://neupgroup.com/assets/brand.png' : 'https://neupgroup.com/assets/user.png'),
                    });
                }
            } catch (e) {
                if (isMounted) {
                    setDetails({ isUnknown: true, displayName: 'Error Loading', neupId: 'error', displayPhoto: 'https://neupgroup.com/assets/user.png' });
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchAccountDetails();
        return () => { isMounted = false; };
    }, [account.accountId, account.aid, account.isUnknown, account.nid, account.neupId, account.isBrand, account.displayName, account.displayPhoto]);

    const finalAccount = { ...account, ...details };
    const currentAccountId = finalAccount.aid || finalAccount.accountId || '';
    const isOwnerAccount = Boolean(finalAccount.def === 1);
    const effectiveWorkingProfileId = workingProfileId || (isOwnerAccount ? currentAccountId : null);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Prevent navigation if the click is on a button inside AccountActions
        if ((e.target as HTMLElement).closest('[data-action-button]')) {
            return;
        }

        startSwitchTransition(async () => {
            const targetAccountId = currentAccountId;
            if (!targetAccountId) return;

            const currentWorkingProfileId = effectiveWorkingProfileId;
            if (currentWorkingProfileId === targetAccountId) {
                return;
            }

            if (isOwnerAccount) {
                deleteSessionData();
                router.push('/home');
                return;
            }

            const params = new URLSearchParams(searchParams.toString());
            params.set('workingProfile', targetAccountId);

            const query = params.toString();
            router.push(query ? `/home?${query}` : '/home');
        });
    };

    if (loading) {
        return (
            <div className="flex w-full items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                </div>
                <Skeleton className="h-5 w-5" />
            </div>
        );
    }

    const isSelected =
        Boolean(currentAccountId && effectiveWorkingProfileId === currentAccountId) ||
        Boolean(isActive);

    return (
        <div
            onClick={handleClick}
            className={cn(
                "w-full flex items-center justify-between p-4 border rounded-lg transition-colors cursor-pointer",
                isSelected
                    ? "bg-accent/10 border-accent hover:bg-accent/20"
                    : "hover:bg-muted/50"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick(e as any);
                }
            }}
        >
            <div className="flex items-center gap-4">
                <div>
                    <h3 className={cn("font-semibold", isSelected && "text-accent")}>
                        {finalAccount.displayName}
                        {isOwnerAccount && (
                            <span className="ml-1 text-xs font-medium text-muted-foreground">
                                (you)
                            </span>
                        )}
                    </h3>
                    <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                            @{finalAccount.neupId}
                        </p>
                        <AccountActions account={finalAccount} />
                    </div>
                </div>
            </div>
            <ChevronRight className={cn("h-5 w-5", isSelected ? "text-accent" : "text-muted-foreground")} />
        </div>
    );
}
