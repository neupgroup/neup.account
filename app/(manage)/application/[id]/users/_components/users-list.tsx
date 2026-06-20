'use client';

import { useEffect, useState, useTransition, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlowLink } from '@/components/ui/flow-link';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';
import { redirectInApp } from '@/core/helper/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, CheckCircle2 } from '@/components/icons';
import {
  getApplicationUsersPaginated,
  type AppUserEntry,
  type AppUserStatus,
  type AppUserSortKey,
} from '@/services/applications/manage';

const PAGE_SIZE = 20;

const STATUS_TABS: { value: 'all' | AppUserStatus; label: string }[] = [
  { value: 'all',             label: 'All' },
  { value: 'active',          label: 'Active' },
  { value: 'creationRequired', label: 'Pending' },
  { value: 'deactivated',     label: 'Deactivated' },
];

const SINCE_OPTIONS: { value: 'all' | '1d' | '7d' | '30d'; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '1d',  label: 'Last 24 hours' },
  { value: '7d',  label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

function statusVariant(status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'active') return 'default';
  if (status === 'deactivated') return 'destructive';
  return 'outline';
}

function statusLabel(status: string | null): string {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function UserRow({
  appId,
  user,
  isFirst,
  isLast,
}: {
  appId: string;
  user: AppUserEntry;
  isFirst: boolean;
  isLast: boolean;
}) {
  const connectedAt = new Date(user.connectedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const roundingClass =
    isFirst && isLast ? 'rounded-lg'
    : isFirst          ? 'rounded-t-lg'
    : isLast           ? 'rounded-b-lg'
    : '';

  const initials = user.displayName?.charAt(0).toUpperCase() ?? '?';

  return (
    <FlowLink
      href={applicationHref(`/application/users/${user.connectionId}`, appId, { mode: 'root' })}
      className={`
        flex items-center gap-4 px-4 py-3.5
        border border-border bg-card
        transition-colors hover:bg-muted/40
        ${roundingClass}
        ${!isFirst ? '-mt-px' : ''}
      `}
    >
      <Avatar className="h-9 w-9 rounded-md shrink-0">
        <AvatarImage src={user.displayImage ?? undefined} alt={user.displayName ?? ''} />
        <AvatarFallback className="rounded-md text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate leading-tight">
            {user.displayName || 'Unnamed Account'}
          </span>
          {user.isVerified && (
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Joined {connectedAt}
        </p>
      </div>

      <Badge variant={statusVariant(user.status)} className="capitalize shrink-0">
        {statusLabel(user.status)}
      </Badge>
    </FlowLink>
  );
}

function UserListSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className={`
            flex items-center gap-4 px-4 py-3.5 border border-border bg-card
            ${i === 0 ? 'rounded-t-lg' : ''}
            ${i === 7 ? 'rounded-b-lg' : ''}
            ${i > 0 ? '-mt-px' : ''}
          `}
        >
          <Skeleton className="h-9 w-9 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

function UsersListInner({ appId }: { appId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [users, setUsers]           = useState<AppUserEntry[]>([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState<'all' | AppUserStatus>('all');
  const [activeSince, setActiveSince]   = useState<'all' | '1d' | '7d' | '30d'>('all');
  const [sort, setSort]             = useState<AppUserSortKey>('newest');
  const [loading, startTransition]  = useTransition();

  // Seed from URL params
  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearch(q);
    setDebouncedSearch(q);

    const s = searchParams.get('status') as AppUserStatus | null;
    setActiveStatus(s && STATUS_TABS.some((t) => t.value === s) ? s : 'all');

    const since = searchParams.get('activeSince') as '1d' | '7d' | '30d' | null;
    setActiveSince(since && SINCE_OPTIONS.some((o) => o.value === since) ? since : 'all');

    const nextSort = searchParams.get('sort') as AppUserSortKey | null;
    const validSorts: AppUserSortKey[] = ['newest', 'oldest', 'name_asc', 'name_desc'];
    setSort(nextSort && validSorts.includes(nextSort) ? nextSort : 'newest');
  }, [searchParams]);

  // Sync filters to URL
  const syncUrl = useCallback((query: string, status: string, since: string, nextSort: AppUserSortKey) => {
    const params = new URLSearchParams();
    params.set('application', appId);
    if (query.trim()) params.set('q', query.trim());
    if (status !== 'all') params.set('status', status);
    if (since !== 'all') params.set('activeSince', since);
    if (nextSort !== 'newest') params.set('sort', nextSort);
    const qs = params.toString();
    if (qs === searchParams.toString()) return;
    redirectInApp(router, `${pathname}${qs ? `?${qs}` : ''}`, { replace: true, scroll: false });
  }, [appId, router, pathname, searchParams]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [activeStatus, activeSince, sort]);
  useEffect(() => {
    syncUrl(debouncedSearch, activeStatus, activeSince, sort);
  }, [debouncedSearch, activeStatus, activeSince, sort, syncUrl]);

  const fetchPage = useCallback(() => {
    startTransition(async () => {
      const result = await getApplicationUsersPaginated({
        appId,
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        status: activeStatus === 'all' ? undefined : activeStatus,
        activeSince: activeSince === 'all' ? undefined : activeSince,
        sort,
      });
      setUsers(result.users);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    });
  }, [appId, page, debouncedSearch, activeStatus, activeSince, sort]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="grid gap-6">
      {/* Count */}
      <p className="text-muted-foreground text-sm">
        {loading
          ? 'Loading…'
          : total === 0
          ? 'No users found'
          : `${start}–${end} of ${total} user${total !== 1 ? 's' : ''}`}
      </p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, or use type:brand&activein:7d&role:owner"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filters + sort */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status tabs */}
          <Tabs
            value={activeStatus}
            onValueChange={(v) => {
              const val = v as 'all' | AppUserStatus;
              setActiveStatus(val);
            }}
          >
            <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
              {STATUS_TABS.map((tab) => (
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

          {/* Active since */}
          <Select
            value={activeSince}
            onValueChange={(v) => {
              const val = v as 'all' | '1d' | '7d' | '30d';
              setActiveSince(val);
            }}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SINCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort */}
        <Select value={sort} onValueChange={(v) => setSort(v as AppUserSortKey)}>
          <SelectTrigger className="w-44 h-8 text-xs gap-1.5">
            <ArrowUpDown className="h-3 w-3 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name_asc">Name A → Z</SelectItem>
            <SelectItem value="name_desc">Name Z → A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <UserListSkeleton />
      ) : users.length > 0 ? (
        <div>
          {users.map((user, i) => (
            <UserRow
              appId={appId}
              key={user.connectionId}
              user={user}
              isFirst={i === 0}
              isLast={i === users.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-muted-foreground">
          No users found.
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

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
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

export function UsersList({ appId }: { appId: string }) {
  return (
    <Suspense fallback={<UserListSkeleton />}>
      <UsersListInner appId={appId} />
    </Suspense>
  );
}
