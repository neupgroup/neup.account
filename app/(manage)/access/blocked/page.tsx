'use client';

import { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { useToast } from '@/neup.core/hooks/use-toast';
import {
  getBlockedUsers,
  getRestrictedUsers,
  blockUser,
  unblockUser,
  restrictUser,
  unrestrictUser,
  type BlockedUser,
} from '@/services/manage/people/blocked';

import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, UserPlus, Trash2, Ban, EyeOff } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { cn } from '@/neup.core/helpers/utils';

function UserListSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-grow space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );
}

function AddUserForm({ onAdd, disabled, placeholder }: { onAdd: (neupId: string) => Promise<{ success: boolean; error?: string | undefined; }>; disabled: boolean; placeholder: string; }) {
    const [isAdding, startAddTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAdd = async (formData: FormData) => {
        const neupId = formData.get('neupId') as string;
        if (!neupId || neupId.trim() === '') return;
        
        setError(null);
        startAddTransition(async () => {
            const result = await onAdd(neupId);
            if (result.success) {
                formRef.current?.reset();
            } else {
                setError(result.error || "An unknown error occurred.");
                if (inputRef.current) {
                    inputRef.current.focus();
                }
            }
        });
    };
    
    return (
        <form ref={formRef} action={handleAdd} className="w-full">
            <div className="w-full space-y-2">
                <div className="relative">
                    <Input
                        ref={inputRef}
                        name="neupId"
                        placeholder={placeholder}
                        disabled={isAdding || disabled}
                        required
                        onChange={() => error && setError(null)}
                        aria-invalid={!!error}
                        className={cn("pr-12", error && "border-destructive focus-visible:ring-destructive")}
                    />
                    <Button type="submit" size="icon" variant="ghost" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent" disabled={isAdding || disabled}>
                        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                        <span className="sr-only">Add User</span>
                    </Button>
                </div>
                {error && (
                    <p className="text-sm text-destructive px-1">{error}</p>
                )}
            </div>
        </form>
    )
}

function UserListManager({
  fetchFunction,
  addFunction,
  removeFunction,
  title,
  description,
  placeholder,
  Icon,
}: {
  fetchFunction: () => Promise<BlockedUser[]>;
  addFunction: (neupId: string) => Promise<{ success: boolean; error?: string }>;
  removeFunction: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  title: string;
  description: string;
  placeholder: string;
  Icon: React.ElementType;
}) {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const fetchedUsers = await fetchFunction();
    setUsers(fetchedUsers);
    setLoading(false);
  }, [fetchFunction]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  
  const handleRemove = async (accountId: string) => {
    startTransition(async () => {
        const result = await removeFunction(accountId);
        if (result.success) {
            setUsers(prev => prev.filter(u => u.accountId !== accountId));
            toast({title: "User removed successfully."});
        } else {
            toast({variant: "destructive", title: "Error", description: result.error});
        }
    })
  }

  const handleAdd = async (neupId: string) => {
    const result = await addFunction(neupId);
    if(result.success) {
        toast({title: "User added successfully.", className: "bg-accent text-accent-foreground"});
        await loadUsers();
    }
    return result;
  }

  return (
    <div className="space-y-2">
        <SecondaryHeader title={title} description={description} />
        <Card>
            <CardContent className="p-0">
                {loading ? (
                    <UserListSkeleton />
                ) : users.length > 0 ? (
                    <div className="divide-y">
                        {users.map((user) => (
                            <div key={user.accountId} className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-4">
                                <Avatar>
                                    <AvatarImage src={user.displayPhoto} alt={user.displayName} data-ai-hint="person" />
                                    <AvatarFallback />
                                </Avatar>
                                <div>
                                    <p className="font-medium">{user.displayName}</p>
                                    <p className="text-sm text-muted-foreground font-mono">@{user.neupId}</p>
                                </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleRemove(user.accountId)} disabled={isPending} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center p-8 gap-4 text-muted-foreground">
                        <Icon className="h-12 w-12" />
                        <p>No users in this list.</p>
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-4 border-t">
                <AddUserForm onAdd={handleAdd} disabled={isPending} placeholder={placeholder} />
            </CardFooter>
        </Card>
    </div>
  );
}

export default function BlockedUsersPage() {
  return (
    <div className="grid gap-8">
      <BackButton href="/access" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Blocked & Restricted Users</h1>
        <p className="text-muted-foreground">Manage users you have blocked or muted.</p>
      </div>

       <div className="space-y-8">
            <UserListManager
                fetchFunction={getBlockedUsers}
                addFunction={blockUser}
                removeFunction={unblockUser}
                title="Blocked Users"
                description="Blocked users cannot find or interact with your profile."
                placeholder="Enter NeupID to block..."
                Icon={Ban}
            />
            <UserListManager
                fetchFunction={getRestrictedUsers}
                addFunction={restrictUser}
                removeFunction={unrestrictUser}
                title="Restricted Users"
                description="You won't see notifications from restricted users."
                placeholder="Enter NeupID to restrict..."
                Icon={EyeOff}
            />
       </div>
    </div>
  );
}
