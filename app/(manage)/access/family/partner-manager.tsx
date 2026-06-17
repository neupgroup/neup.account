

"use client";

import { useState, useTransition, useRef } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { addPartner, removeFamilyMember } from '@/services/manage/people/family';
import type { FamilyMember, FamilyGroup } from '@/services/manage/people/family';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Loader2, Trash2, EyeOff, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/core/helpers/utils';
import { Label } from '@/components/ui/label';

function PartnerDisplay({ familyId, partner, onRemove, onTogglePrivacy }: { familyId: string, partner: FamilyMember, onRemove: (familyId: string, partnerAccountId: string) => void, onTogglePrivacy: (id: string, isPublic: boolean) => void }) {
    const [isRemoving, startRemoveTransition] = useTransition();
    const [isToggling, startToggleTransition] = useTransition();

    const handleRemove = () => {
        startRemoveTransition(() => onRemove(familyId, partner.accountId));
    }
    
    const handleToggle = () => {
        startToggleTransition(() => onTogglePrivacy(partner.accountId, !partner.hidden));
    }

    return (
        <div>
            <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-4">
                    <Avatar>
                        <AvatarImage src={partner.displayPhoto} alt={partner.displayName} data-ai-hint="person" />
                        <AvatarFallback />
                    </Avatar>
                    <div>
                        <p className="font-medium">{partner.displayName}</p>
                        <p className="text-sm text-muted-foreground font-mono">@{partner.neupId}</p>
                    </div>
                </div>
                 <Button variant="ghost" size="icon" onClick={handleRemove} disabled={isRemoving} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
            </div>
             <div className="flex items-center space-x-2 mt-4 border-t pt-4">
                <Button onClick={handleToggle} variant="outline" size="sm" disabled={isToggling}>
                    {isToggling ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : partner.hidden ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                    Make {partner.hidden ? 'Public' : 'Private'}
                </Button>
                <Label htmlFor="privacy-toggle" className="text-sm text-muted-foreground">
                    {partner.hidden ? 'Only visible to you.' : 'Visible to all family members.'}
                </Label>
            </div>
        </div>
    );
}

function AddPartnerForm({ onAdd }: { onAdd: (partner: FamilyMember) => void }) {
    const [isAdding, startAddTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleAddPartner = async (formData: FormData) => {
        setError(null);
        startAddTransition(async () => {
            const result = await addPartner(formData);
            if (result.success) {
                toast({ title: "Partner Invite Sent", description: "Your partner has been invited to your family group.", className: "bg-accent text-accent-foreground" });
                formRef.current?.reset();
            } else {
                setError(result.error || "An unknown error occurred.");
                 if(inputRef.current) inputRef.current.focus();
            }
        });
    };
    
    return (
        <form ref={formRef} action={handleAddPartner} className="w-full">
            <div className="w-full space-y-2">
                <div className="relative">
                    <Input
                        ref={inputRef}
                        name="neupId"
                        placeholder="Enter your partner's NeupID"
                        disabled={isAdding}
                        required
                        onChange={(e) => {
                            e.target.value = e.target.value.toLowerCase();
                            if (error) setError(null);
                        }}
                        aria-invalid={!!error}
                        className={cn("pr-12", error && "border-destructive focus-visible:ring-destructive")}
                    />
                    <Button type="submit" size="icon" variant="ghost" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent" disabled={isAdding}>
                         {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                         <span className="sr-only">Add Partner</span>
                    </Button>
                </div>
                 {error && <p className="text-sm text-destructive px-1">{error}</p>}
            </div>
        </form>
    )
}

export function PartnerManager({ initialFamilyGroup }: { initialFamilyGroup: FamilyGroup | null }) {
    const [familyGroup, setFamilyGroup] = useState(initialFamilyGroup);
    const { toast } = useToast();

    // The partner is a member who is hidden
    const partner = familyGroup?.members.find(m => m.hidden);

    const removePartnerHandler = async (familyId: string, partnerAccountId: string) => {
        const result = await removeFamilyMember(familyId, partnerAccountId);
         if (result.success) {
            toast({ title: "Success", description: "Partner removed from family." });
            setFamilyGroup(prev => {
                if (!prev) return null;
                return { ...prev, members: prev.members.filter(m => m.accountId !== partnerAccountId) };
            });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
    }
    
    const togglePrivacyHandler = (partnerId: string, makePublic: boolean) => {
        // Placeholder for the actual server action
        console.log(`Toggling privacy for ${partnerId} to ${makePublic ? 'public' : 'private'}`);
        setFamilyGroup(p => {
            if (!p) return null;
            return {
                ...p,
                members: p.members.map(m => m.accountId === partnerId ? { ...m, hidden: !makePublic } : m)
            }
        });
        toast({ title: "Privacy Updated", description: `Partner is now ${makePublic ? 'public' : 'private'}.` });
    }

    return (
        <div>
            {partner && familyGroup ? (
                <PartnerDisplay familyId={familyGroup.id} partner={partner} onRemove={removePartnerHandler} onTogglePrivacy={togglePrivacyHandler} />
            ) : (
                <AddPartnerForm onAdd={() => {
                    // This will be handled by revalidation, but we can be optimistic if needed
                }} />
            )}
        </div>
    );
}
