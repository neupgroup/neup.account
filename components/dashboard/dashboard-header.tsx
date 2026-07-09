
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useRouter } from 'next/navigation';
import { VerifiedBadge } from '../verified-badge';
import { useSession } from '@/core/providers/session';
import { redirectInApp } from '@/core/helpers/navigation';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

export function DashboardHeader() {
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();
    const { profile, loading, isManaging, accountId } = useSession();

    const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            redirectInApp(router, `/manage/search?q=${encodeURIComponent(searchTerm.trim())}`);
        }
    };
    
    if (loading || !profile) {
        return (
             <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-16 w-16 rounded-lg" />
                    <div>
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-5 w-24 mt-2" />
                    </div>
                </div>
                <Skeleton className="h-10 w-full" />
            </div>
        )
    }

    const greetingName = isManaging ? profile.nameDisplay : profile.nameFirst;


    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                 <Avatar className="h-16 w-16 rounded-lg">
                    <AvatarImage src={profile?.accountPhoto || "https://neupgroup.com/assets/user.png"} alt={profile?.nameDisplay} data-ai-hint="person" />
                    <AvatarFallback className="rounded-lg text-xl">
                        {`${profile?.nameDisplay?.[0] || ''}`.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <p className="text-muted-foreground">{getGreeting()}</p>
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold tracking-tight">{greetingName || 'User'}!</h1>
                        {accountId && <VerifiedBadge accountId={accountId} className="h-6 w-6" />}
                    </div>
                </div>
            </div>

             <form onSubmit={handleSearch}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search settings, people, apps, invoices..." 
                        className="pl-10" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </form>
        </div>
    )
}
