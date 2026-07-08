

"use client";

import { useState, useTransition, useRef } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { addRecoveryAccount, removeRecoveryAccount, type RecoveryAccount } from '@/services/security/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Loader2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/core/helpers/utils';
import { CardFooter } from '@/components/ui/card';

function AccountItem({ account, onRemove }: { account: RecoveryAccount, onRemove: (id: string) => void }) {
    const [isRemoving, startRemoveTransition] = useTransition();

    const handleRemove = () => {
        startRemoveTransition(() => {
            onRemove(account.id);
        });
    }

    const statusText = account.status === 'approved' ? '' : `(${account.status})`;
    const statusColor = {
        pending: 'text-orange-500',
        rejected: 'text-destructive',
        approved: ''
    };

    return (
        <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
                <Avatar>
                    <AvatarImage src={account.displayPhoto} alt={account.displayName} data-ai-hint="person" />
                    <AvatarFallback />
                </Avatar>
                <div>
                    <p className="font-medium">{account.displayName}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                        @{account.recoveryNeupId} <span className={cn('text-xs', statusColor[account.status])}>{statusText}</span>
                    </p>
                </div>
            </div>
             <Button variant="ghost" size="icon" onClick={handleRemove} disabled={isRemoving} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
        </div>
    );
}

function AddAccountForm({ onAdd, disabled }: { onAdd: (account: RecoveryAccount) => void, disabled: boolean }) {
    const [isAdding, startAddTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAddAccount = async (formData: FormData) => {
        const neupId = formData.get('neupId') as string;
        if (!neupId || neupId.trim() === '') return;
        
        setError(null);

        startAddTransition(async () => {
            const result = await addRecoveryAccount(formData);
            if (result.success && result.newAccount) {
                toast({ title: "Success", description: "Recovery account added.", className: "bg-accent text-accent-foreground" });
                onAdd(result.newAccount);
                formRef.current?.reset();
            } else {
                setError(result.error || "An unknown error occurred.");
                 if(inputRef.current) {
                    inputRef.current.focus();
                }
            }
        });
    };
    
    return (
        <form ref={formRef} action={handleAddAccount} className="w-full">
            <div className="flex-col items-start gap-2 p-0 pt-4">
                 <div className="w-full space-y-2">
                    <div className="relative">
                        <Input
                            ref={inputRef}
                            name="neupId"
                            placeholder="Enter NeupID of trusted contact"
                            disabled={isAdding || disabled}
                            maxLength={16}
                            required
                            onChange={() => error && setError(null)}
                            aria-invalid={!!error}
                            className={cn("pr-12", error && "border-destructive focus-visible:ring-destructive")}
                        />
                        <Button type="submit" size="icon" variant="ghost" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent" disabled={isAdding || disabled}>
                             {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                             <span className="sr-only">Add Account</span>
                        </Button>
                    </div>
                     {error && (
                        <p className="text-sm text-destructive px-1">{error}</p>
                    )}
                </div>
                {disabled && !error && (
                     <p className="text-xs text-muted-foreground text-center pt-2 w-full">
                        You have reached the maximum of 5 recovery accounts.
                    </p>
                )}
            </div>
        </form>
    )
}

export function RecoveryAccountManager({ initialAccounts }: { initialAccounts: RecoveryAccount[] }) {
    const [accounts, setAccounts] = useState(initialAccounts);
    const { toast } = useToast();

    const addAccount = (newAccount: RecoveryAccount) => {
        setAccounts(prev => {
             const newAccounts = [...prev, newAccount];
             const statusOrder: Record<RecoveryAccount['status'], number> = {
                'approved': 1,
                'pending': 2,
                'rejected': 3,
            };
            newAccounts.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
            return newAccounts;
        });
    };

    const removeAccount = async (id: string) => {
        const result = await removeRecoveryAccount(id);
         if (result.success) {
            toast({ title: "Success", description: "Recovery account removed." });
            setAccounts(prev => prev.filter(acc => acc.id !== id));
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    const canAddMore = accounts.length < 5;

    return (
        <div>
             <div className="divide-y divide-border">
                {accounts.length > 0 ? (
                    accounts.map(acc => (
                        <AccountItem key={acc.id} account={acc} onRemove={removeAccount} />
                    ))
                 ) : null }
             </div>
             {canAddMore && <AddAccountForm onAdd={addAccount} disabled={!canAddMore} />}
        </div>
    );
}
