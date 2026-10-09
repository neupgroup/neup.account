'use client';

import { useState, useEffect } from 'react';
import { Input } from '@neup/components/ui/input';
import { Search } from 'lucide-react';
import { Skeleton } from '@neup/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@neup/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { VerifiedBadge } from '../verified-badge';
import { useSession } from '@/inapp/auth/session-context';
import { redirectInApp } from '@neup/core/helpers/link/navigation';
import { getFallbackDisplayImage } from '@/inapp/display-image';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

export function DashboardHeader() {
    const [searchTerm, setSearchTerm] = useState('');
    const [greeting, setGreeting] = useState('Welcome');
    const router = useRouter();
    const { profile, loading, isManaging, accountId } = useSession();

    useEffect(() => { setGreeting(getGreeting()); }, []);

    const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (searchTerm.trim()) redirectInApp(router, `/manage/search?q=${encodeURIComponent(searchTerm.trim())}`);
    };

    if (loading || !profile) return <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" /></div>;

    const greetingName = isManaging ? profile.nameDisplay : profile.nameFirst;
    return <div className="space-y-4">
        <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 rounded-lg"><AvatarImage src={profile.accountPhoto || getFallbackDisplayImage({ accountType: profile.accountType, gender: profile.gender })} alt={profile.nameDisplay} /><AvatarFallback className="rounded-lg text-xl">{`${profile.nameDisplay?.[0] || ''}`.toUpperCase()}</AvatarFallback></Avatar>
            <div><p className="text-muted-foreground">{greeting}</p><div className="flex items-center gap-2"><h1 className="font-bold tracking-tight text-2xl leading-8">{greetingName || 'User'}!</h1>{accountId && <VerifiedBadge accountId={accountId} className="h-6 w-6" />}</div></div>
        </div>
        <form onSubmit={handleSearch}><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search settings, people, apps, invoices..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div></form>
    </div>;
}
