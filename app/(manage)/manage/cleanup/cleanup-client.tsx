'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import {
    deleteExpiredGuestAccount,
    deleteAllExpiredGuestAccounts,
    getExpiredGuestAccounts,
    type ExpiredGuestAccount,
} from '@/services/manage/accounts/cleanup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2, ShieldAlert, CalendarClock, RefreshCw } from 'lucide-react';

export function CleanupClient({ initialAccounts }: { initialAccounts: ExpiredGuestAccount[] }) {
    const [accounts, setAccounts] = useState<ExpiredGuestAccount[]>(initialAccounts);
    const [isPending, startTransition] = useTransition();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { toast } = useToast();

    const refresh = () => {
        startTransition(async () => {
            const result = await getExpiredGuestAccounts();
            setAccounts(result.accounts);
        });
    };

    const handleDeleteOne = (accountId: string) => {
        setDeletingId(accountId);
        startTransition(async () => {
            const result = await deleteExpiredGuestAccount(accountId);
            if (result.success) {
                setAccounts((prev) => prev.filter((a) => a.id !== accountId));
                toast({ title: 'Deleted', description: 'Guest account has been permanently deleted.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
            setDeletingId(null);
        });
    };

    const handleDeleteAll = () => {
        startTransition(async () => {
            const result = await deleteAllExpiredGuestAccounts();
            if (result.success) {
                setAccounts([]);
                toast({
                    title: 'Cleanup complete',
                    description: `${result.deletedCount} expired guest account${result.deletedCount !== 1 ? 's' : ''} permanently deleted.`,
                });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };

    return (
        <div className="grid gap-6">
            {/* Danger warning */}
            <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Irreversible action</AlertTitle>
                <AlertDescription>
                    Deleting accounts permanently removes all associated data — sessions, contacts, activity logs,
                    notifications, and auth methods. This cannot be undone.
                </AlertDescription>
            </Alert>

            {/* Header row with count + bulk action */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        {accounts.length === 0
                            ? 'No expired guest accounts'
                            : `${accounts.length} expired guest account${accounts.length !== 1 ? 's' : ''} found`}
                    </span>
                    {accounts.length > 0 && (
                        <Badge variant="destructive">{accounts.length}</Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={isPending}
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isPending ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>

                    {accounts.length > 0 && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={isPending}>
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                    Delete All ({accounts.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete all expired guest accounts?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete {accounts.length} expired guest account
                                        {accounts.length !== 1 ? 's' : ''} and all their associated data.
                                        This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDeleteAll}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        Delete all
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>

            {/* Account list */}
            {accounts.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                        No expired guest accounts to clean up.
                    </CardContent>
                </Card>
            ) : (
                <div>
                    {accounts.map((account, i) => {
                        const isFirst = i === 0;
                        const isLast = i === accounts.length - 1;
                        const roundingClass =
                            isFirst && isLast ? 'rounded-lg'
                            : isFirst          ? 'rounded-t-lg'
                            : isLast           ? 'rounded-b-lg'
                            : '';
                        const isDeleting = deletingId === account.id && isPending;

                        return (
                            <div
                                key={account.id}
                                className={`
                                    flex items-center gap-4 px-4 py-3.5
                                    border border-border bg-card
                                    ${roundingClass}
                                    ${!isFirst ? '-mt-px' : ''}
                                    ${isDeleting ? 'opacity-50' : ''}
                                    transition-opacity
                                `}
                            >
                                {/* Avatar */}
                                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-foreground select-none">
                                    {account.displayName?.charAt(0).toUpperCase() ?? 'G'}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate leading-tight">
                                        {account.displayName || 'Unnamed Guest'}
                                    </p>
                                    <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                                        <CalendarClock className="h-3 w-3 shrink-0" />
                                        <span>Created {account.createdAt}</span>
                                    </div>
                                </div>

                                {/* Status + delete */}
                                <div className="flex items-center gap-3 shrink-0">
                                    <Badge variant="outline" className="text-xs text-destructive border-destructive/40">
                                        expired
                                    </Badge>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                disabled={isPending}
                                            >
                                                {isDeleting
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <Trash2 className="h-4 w-4" />
                                                }
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete this account?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Permanently delete{' '}
                                                    <strong>{account.displayName || 'this guest account'}</strong>{' '}
                                                    and all associated data. This cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() => handleDeleteOne(account.id)}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    Delete
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
