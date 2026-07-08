"use client";

import React, { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Laptop, MapPin } from 'lucide-react';
import { logoutSessionById, logoutAllOtherSessions } from '@/services/security/sessions';
import type { ManagedSession } from '@/services/security/sessions';
import { useToast } from '@/core/hooks/use-toast';
import { CardFooter } from '@/components/ui/card';

export function SessionManager({ initialSessions, currentSessionId }: { initialSessions: ManagedSession[], currentSessionId: string | null }) {
    const [sessions, setSessions] = useState(initialSessions);
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    const { toast } = useToast();

    const sortedSessions = useMemo(() => {
        const current = sessions.find(s => s.id === currentSessionId);
        const others = sessions.filter(s => s.id !== currentSessionId);
        
        // The server action already sorts by date, so no need to re-sort `others`.
        
        return current ? [current, ...others] : others;
    }, [sessions, currentSessionId]);

    const handleSignOut = async (sessionId: string) => {
        startTransition(async () => {
            const result = await logoutSessionById(sessionId);
            if (result.success) {
                toast({ title: "Success", description: "Session signed out successfully." });
                setSessions(prev => prev.filter(s => s.id !== sessionId));
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };
    
    const handleSignOutAllOthers = async () => {
        startTransition(async () => {
            const result = await logoutAllOtherSessions();
            if (result.success) {
                toast({ title: "Success", description: "All other sessions have been signed out.", className: "bg-accent text-accent-foreground" });
                setSessions(prev => prev.filter(s => s.id === currentSessionId));
            } else {
                toast({ variant: "destructive", title: "Error", description: result.error });
            }
        });
    };

    return (
        <div>
             <div className="border rounded-lg">
                {sortedSessions.map(session => {
                    const isCurrent = session.id === currentSessionId;
                    return (
                        <div key={session.id} className="flex items-start gap-4 p-4 border-b last:border-b-0">
                            <Laptop className="h-8 w-8 text-muted-foreground mt-1 flex-shrink-0" />
                            <div className="flex-grow">
                                <p className="font-medium">
                                    {session.userAgent}
                                </p>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <span>{session.ipAddress}</span>
                                    {session.geolocation && (
                                        <>
                                            <span>&bull;</span>
                                            <MapPin className="h-3 w-3 inline-block" />
                                            <span>{session.geolocation}</span>
                                        </>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Last active: {session.lastLoggedIn} &bull; Login via {session.loginType}</p>
                                {isCurrent && <Badge variant="default" className="mt-2 bg-primary">Current</Badge>}
                            </div>
                            {!isCurrent && (
                                <Button variant="outline" size="sm" onClick={() => handleSignOut(session.id)} disabled={isPending} className="flex-shrink-0">
                                    {isPending ? 'Signing out...' : 'Sign out'}
                                </Button>
                            )}
                        </div>
                    )
                })}
                {sessions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No active sessions found.</p>}
            </div>
             <CardFooter className="flex justify-end pt-4">
                <Button variant="outline" onClick={handleSignOutAllOthers} disabled={isPending || sessions.length <= 1}>
                     {isPending ? 'Signing out...' : 'Sign out all other devices'}
                </Button>
            </CardFooter>
        </div>
    );
}
