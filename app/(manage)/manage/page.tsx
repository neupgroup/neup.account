"use client";

import { useEffect, useState, useTransition, Suspense, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar';
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "#/components/ui/select";
import {
    Search, Ban, CheckCircle2, AtSign, Clock,
    ArrowUpDown, ChevronLeft, ChevronRight,
} from "@/components/icons";
import {
    getAllAccountsPaginated,
    type AccountBasics,
    type AccountFilterTab,
    type AccountSortKey,
} from '@/services/manage/accounts';
import { Skeleton } from '#/components/ui/skeleton';
import { BackButton } from '#/components/ui/back-button';
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { PrimaryHeader } from "#/components/ui/primary-header";
import { FlowLink } from '#/components/ui/flow-link';
import { useSearchParams } from 'next/navigation';

const PAGE_SIZE = 10;

const FILTER_TABS: { value: AccountFilterTab; label: string }[] = [
    { value: 'all',        label: 'All' },
    { value: 'active',     label: 'Active' },
    { value: 'individual', label: 'Individual' },
    { value: 'brand',      label: 'Brand' },
    { value: 'guest',      label: 'Guest' },
];

function StatusDot({ status }: { status: string | null }) {
    let color = 'bg-gray-400';
    if (status === 'active') color = 'bg-green-500';
    else if (status === 'expired' || status === 'suspended' || status === 'banned') color = 'bg-red-500';
    return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${color}`} />;
}

function AccountRow({ acc, isFirst, isLast }: { acc: AccountBasics; isFirst: boolean; isLast: boolean }) {
    const lastActive = acc.lastActivityAt
        ? new Date(acc.lastActivityAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : null;

    const roundingClass =
        isFirst && isLast ? 'rounded-lg'
        : isFirst          ? 'rounded-t-lg'
        : isLast           ? 'rounded-b-lg'
        : '';

    return (
        <FlowLink href={`/manage/${acc.id}`}>
            <div
                className={`
                    flex items-center gap-4 px-4 py-3.5
                    border border-border bg-card
                    hover:bg-accent/40 transition-colors
                    ${roundingClass}
                    ${!isFirst ? '-mt-px' : ''}
                `}
            >
                <Avatar className="h-9 w-9 rounded-md shrink-0">
                    <AvatarImage src={acc.displayImage ?? undefined} alt={acc.displayName ?? ''} className="object-cover" />
                    <AvatarFallback className="rounded-md text-sm font-semibold">
                        {acc.displayName?.charAt(0).toUpperCase() ?? '?'}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <StatusDot status={acc.status} />
                        <span className="font-medium truncate leading-tight">
                            {acc.displayName || 'Unnamed Account'}
                        </span>
                        {acc.isVerified && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                        {acc.neupId ? (
                            <>
                                <AtSign className="h-3 w-3 shrink-0" />
                                <span className="font-mono truncate">{acc.neupId}</span>
                            </>
                        ) : (
                            <span className="italic">No NeupID</span>
                        )}
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-xs capitalize">
                        {acc.accountType}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{lastActive ?? 'Never active'}</span>
                    </div>
                </div>
            </div>
        </FlowLink>
    );
}

function AccountListSkeleton() {
    return (
        <div>
            {Array.from({ length: PAGE_SIZE }, (_, i) => (
                <div
                    key={i}
                    className={`
                        flex items-center gap-4 px-4 py-3.5 border border-border bg-card
                        ${i === 0 ? 'rounded-t-lg' : ''}
                        ${i === PAGE_SIZE - 1 ? 'rounded-b-lg' : ''}
                        ${i > 0 ? '-mt-px' : ''}
                    `}
                >
                    <Skeleton className="h-9 w-9 rounded-md shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function AccountsPageInner() {
    const searchParams = useSearchParams();

    const [accounts, setAccounts]           = useState<AccountBasics[]>([]);
    const [total, setTotal]                 = useState(0);
    const [totalPages, setTotalPages]       = useState(0);
    const [page, setPage]                   = useState(1);
    const [search, setSearch]               = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [activeTab, setActiveTab]         = useState<AccountFilterTab>('all');
    const [sort, setSort]                   = useState<AccountSortKey>('newest');
    const [loading, startTransition]        = useTransition();
    const [permissionDenied, setPermissionDenied] = useState(false);

    // Seed search, filter, and sort from URL params
    useEffect(() => {
        const q = searchParams.get('q') || '';
        setSearch(q);
        setDebouncedSearch(q);

        const f = searchParams.get('filter') as AccountFilterTab | null;
        if (f && FILTER_TABS.some((t) => t.value === f)) {
            setActiveTab(f);
        }

        const s = searchParams.get('sort') as AccountSortKey | null;
        const validSorts: AccountSortKey[] = ['newest', 'oldest', 'name_asc', 'name_desc', 'last_active'];
        if (s && validSorts.includes(s)) {
            setSort(s);
        }
    }, [searchParams]);

    // Debounce search input — reset to page 1 on change
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    // Reset to page 1 when filter or sort changes
    useEffect(() => { setPage(1); }, [activeTab, sort]);

    const fetchPage = useCallback(() => {
        startTransition(async () => {
            const result = await getAllAccountsPaginated({
                page,
                pageSize: PAGE_SIZE,
                search: debouncedSearch,
                filter: activeTab,
                sort,
            });
            if (result.total === 0 && !debouncedSearch && activeTab === 'all') {
                setPermissionDenied(true);
            } else {
                setPermissionDenied(false);
            }
            setAccounts(result.accounts);
            setTotal(result.total);
            setTotalPages(result.totalPages);
        });
    }, [page, debouncedSearch, activeTab, sort]);

    useEffect(() => { fetchPage(); }, [fetchPage]);

    const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end   = Math.min(page * PAGE_SIZE, total);

    if (permissionDenied) {
        return (
            <div className="grid gap-8">
                <PrimaryHeader title="Accounts" description="View and manage all accounts in the system." />
                <Alert variant="destructive">
                    <Ban className="h-4 w-4" />
                    <AlertTitle>Permission Denied</AlertTitle>
                    <AlertDescription>You do not have permission to view account management.</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="grid gap-6">
            <BackButton href="/manage" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
                <p className="text-muted-foreground">
                    {loading
                        ? 'Loading…'
                        : total === 0
                        ? 'No accounts found'
                        : `${start}–${end} of ${total} account${total !== 1 ? 's' : ''}`}
                </p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name, or use type:root&activein:1h&role:admin"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Filter tabs + sort */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccountFilterTab)}>
                    <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
                        {FILTER_TABS.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="rounded-full border border-border bg-background px-3 py-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-none"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <Select value={sort} onValueChange={(v) => setSort(v as AccountSortKey)}>
                    <SelectTrigger className="w-44 h-8 text-xs gap-1.5">
                        <ArrowUpDown className="h-3 w-3 shrink-0" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
                        <SelectItem value="oldest">Oldest first</SelectItem>
                        <SelectItem value="name_asc">Name A → Z</SelectItem>
                        <SelectItem value="name_desc">Name Z → A</SelectItem>
                        <SelectItem value="last_active">Last active</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* List */}
            {loading ? (
                <AccountListSkeleton />
            ) : accounts.length > 0 ? (
                <div>
                    {accounts.map((acc, i) => (
                        <AccountRow
                            key={acc.id}
                            acc={acc}
                            isFirst={i === 0}
                            isLast={i === accounts.length - 1}
                        />
                    ))}
                </div>
            ) : (
                <div className="py-16 text-center text-muted-foreground">
                    No accounts found.
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>

                        {/* Page number pills */}
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((p) =>
                                p === 1 ||
                                p === totalPages ||
                                Math.abs(p - page) <= 1,
                            )
                            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                                acc.push(p);
                                return acc;
                            }, [])
                            .map((item, idx) =>
                                item === 'ellipsis' ? (
                                    <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-sm">…</span>
                                ) : (
                                    <Button
                                        key={item}
                                        variant={item === page ? 'default' : 'outline'}
                                        size="icon"
                                        className="h-8 w-8 text-xs"
                                        disabled={loading}
                                        onClick={() => setPage(item)}
                                    >
                                        {item}
                                    </Button>
                                ),
                            )}

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={page >= totalPages || loading}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AccountsPage() {
    return (
        <Suspense fallback={
            <div className="grid gap-6 p-8">
                <Skeleton className="h-9 w-1/2" />
                <AccountListSkeleton />
            </div>
        }>
            <AccountsPageInner />
        </Suspense>
    );
}
