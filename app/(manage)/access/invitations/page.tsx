"use client";

import { useState, useEffect, useTransition } from 'react';
import { notFound } from 'next/navigation';
import { useToast } from '@neup/core/hooks/useToast';
import { getInvitations, acceptRequest, rejectRequest } from '@/services/manage/people/invitations';
import type { Invitation } from '@/services/manage/people/invitations';
import { Card, CardContent } from '@neup/components/ui/card';
import { Button } from '@neup/components/ui/button';
import { Check, X, Loader2, Users, Handshake } from 'lucide-react';
import { Skeleton } from '@neup/components/ui/skeleton';
import { BackButton } from '@neup/components/element/backButton';
import { useSession } from '@/inapp/auth/session-context';
import { hasAnyPermission } from '@/inapp/permissions/profile-permissions';
import { permission } from '@neup/logica/permission';
import {
    ACCESS_INVITATION_APPROVE_PERMISSIONS,
    ACCESS_INVITATIONS_VIEW_PERMISSIONS,
} from '@/inapp/permissions/access-view-permissions';

const pagePermissions = [
    permission('access.invitations.view.self', 'for_individual', 'page'),
    permission('access.invitation.approve.self', 'for_individual', 'page'),
];

function InvitationCard({
    invitation,
    onAction,
    canApprove,
}: {
    invitation: Invitation,
    onAction: () => void,
    canApprove: boolean,
}) {
    const [isAccepting, startAcceptTransition] = useTransition();
    const [isRejecting, startRejectTransition] = useTransition();
    const { toast } = useToast();

    const getActionText = () => {
        if (invitation.action === 'family_invitation') {
            return `${invitation.senderName} has invited you to join their family.`;
        }
        if (invitation.action === 'access_invitation') {
            return `${invitation.senderName} wants you to help manage their account.`;
        }
        return 'You have a new request.';
    };

    const handleAccept = () => {
        startAcceptTransition(async () => {
            const result = await acceptRequest(invitation.requestId, invitation.notificationId);
            if (result.success) {
                toast({ title: 'Request accepted!', className: 'bg-accent text-accent-foreground' });
                onAction();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };

    const handleReject = () => {
        startRejectTransition(async () => {
            const result = await rejectRequest(invitation.requestId, invitation.notificationId);
            if (result.success) {
                toast({ title: 'Request rejected.' });
                onAction();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        });
    };

    const getIcon = () => {
        if (invitation.action === 'family_invitation') return <Users className="h-6 w-6 text-muted-foreground" />;
        if (invitation.action === 'access_invitation') return <Handshake className="h-6 w-6 text-muted-foreground" />;
        return <Users className="h-6 w-6 text-muted-foreground" />;
    }

    const isPending = isAccepting || isRejecting;

    return (
        <Card>
            <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                    {getIcon()}
                    <div>
                        <p className="font-medium">{getActionText()}</p>
                        <p className="text-sm text-muted-foreground">@{invitation.senderNeupId}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outlined" size="icon" className="h-8 w-8 text-green-600 border-green-600 hover:bg-green-50" onClick={handleAccept} disabled={isPending || !canApprove}>
                        {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button variant="solid" convey="danger" size="icon" className="h-8 w-8" onClick={handleReject} disabled={isPending || !canApprove}>
                        {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export default function InvitationsPage() {
    const { permissions, loading: sessionLoading } = useSession();
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const canViewInvitations = hasAnyPermission(permissions, [...ACCESS_INVITATIONS_VIEW_PERMISSIONS]);
    const canApproveInvitations = hasAnyPermission(permissions, [...ACCESS_INVITATION_APPROVE_PERMISSIONS]);

    const fetchInvitations = async () => {
        setPageLoading(true);
        const data = await getInvitations();
        setInvitations(data);
        setPageLoading(false);
    };

    useEffect(() => {
        if (!sessionLoading && !canViewInvitations) {
            setInvitations([]);
            setPageLoading(false);
            return;
        }
        if (!sessionLoading) {
            fetchInvitations();
        }
    }, [sessionLoading, canViewInvitations]);

    if (!sessionLoading && !canViewInvitations) {
        notFound();
    }

    return (
        <div className="grid gap-8">
            <BackButton backsTo="/access" />
            <div>
                <h1 className="font-bold tracking-tight text-2xl leading-8">Invitations</h1>
                <p className="text-muted-foreground text-sm leading-6">
                    Accept or reject requests from other users.
                </p>
            </div>
            <div className="space-y-4">
                {pageLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : invitations.length > 0 ? (
                    invitations.map(inv => (
                        <InvitationCard
                            key={inv.requestId}
                            invitation={inv}
                            onAction={fetchInvitations}
                            canApprove={canApproveInvitations}
                        />
                    ))
                ) : (
                    <Card>
                        <CardContent className="p-8 text-center text-muted-foreground">
                            <h3 className="font-semibold text-lg leading-7">No pending invitations</h3>
                            <p className="text-sm leading-6">You're all caught up!</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
