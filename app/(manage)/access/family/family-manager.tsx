
"use client";

import { useState, useTransition, useRef } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { addFamilyMember, removeFamilyMember } from '@/services/manage/people/family';
import type { FamilyMember, FamilyGroup } from '@/services/manage/people/family';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Loader2, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/core/helpers/utils';
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
} from "@/components/ui/alert-dialog"

function MemberItem({ familyId, member, onRemove }: { familyId: string, member: FamilyMember, onRemove: (familyId: string, memberAccountId: string) => void }) {
    const [isRemoving, startRemoveTransition] = useTransition();

    const handleRemove = () => {
        startRemoveTransition(() => {
            onRemove(familyId, member.accountId);
        });
    }

    return (
        <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
                <Avatar>
                    <AvatarImage src={member.displayPhoto} alt={member.displayName} data-ai-hint="person" />
                    <AvatarFallback />
                </Avatar>
                <div>
                    <p className="font-medium">{member.displayName}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                        @{member.neupId}
                    </p>
                </div>
            </div>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={isRemoving} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Remove {member.displayName}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to remove this person from your family group?
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        Yes, Remove
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function AddMemberForm({ disabled }: { disabled: boolean }) {
    const [isAdding, startAddTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAddMember = async (formData: FormData) => {
        const neupId = formData.get('neupId') as string;
        if (!neupId || neupId.trim() === '') return;
        
        setError(null);

        startAddTransition(async () => {
            const result = await addFamilyMember(formData);
            if (result.success) {
                toast({ title: "Request Sent", description: "The user has been invited to join your family.", className: "bg-accent text-accent-foreground" });
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
        <form ref={formRef} action={handleAddMember} className="w-full">
            <div className="flex-col items-start gap-2 pt-4">
                 <div className="w-full space-y-2">
                    <div className="relative">
                        <Input
                            ref={inputRef}
                            name="neupId"
                            placeholder="Enter NeupID to invite a member"
                            disabled={isAdding || disabled}
                            required
                            onChange={(e) => {
                                e.target.value = e.target.value.toLowerCase();
                                if (error) setError(null);
                            }}
                            aria-invalid={!!error}
                            className={cn("pr-12", error && "border-destructive focus-visible:ring-destructive")}
                        />
                        <Button type="submit" size="icon" variant="ghost" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent" disabled={isAdding || disabled}>
                             {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                             <span className="sr-only">Add Member</span>
                        </Button>
                    </div>
                     {error && (
                        <p className="text-sm text-destructive px-1">{error}</p>
                    )}
                </div>
                {disabled && !error && (
                     <p className="text-xs text-muted-foreground text-center pt-2 w-full">
                        You have reached the maximum of 5 family members.
                    </p>
                )}
            </div>
        </form>
    )
}

export function FamilyManager({ familyGroup, canAddMore, isOwner }: { familyGroup: FamilyGroup, canAddMore: boolean, isOwner: boolean }) {
    const [currentFamilyGroup, setCurrentFamilyGroup] = useState(familyGroup);
    const { toast } = useToast();

    const removeMember = async (familyId: string, memberAccountId: string) => {
        const result = await removeFamilyMember(familyId, memberAccountId);
         if (result.success) {
            toast({ title: "Success", description: "Family member removed." });
            setCurrentFamilyGroup(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    members: prev.members.filter(m => m.accountId !== memberAccountId)
                }
            })
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    const familyMembersToDisplay = currentFamilyGroup.members.filter(m => !m.hidden);

    return (
        <div>
             <div className="divide-y divide-border">
                {familyMembersToDisplay.length > 0 ? (
                    familyMembersToDisplay.map(member => (
                        <MemberItem key={member.accountId} familyId={currentFamilyGroup.id} member={member} onRemove={removeMember} />
                    ))
                 ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No family members yet. Add someone to get started.</p>
                 )}
             </div>
             {isOwner && (
                <div className="border-t mt-4">
                    <AddMemberForm disabled={!canAddMore} />
                </div>
             )}
        </div>
    );
}

    
