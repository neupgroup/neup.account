'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from '@/components/icons';
import { TertiaryHeader } from '@/components/ui/tertiary-header';
import NProgress from 'nprogress';
import { redirectInApp } from '@/core/helper/navigation';

export function FindUserCard() {
    const [searchQuery, setSearchQuery] = useState('');
    const router = useRouter();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const searchTerm = searchQuery.trim();
        if (searchTerm) {
            NProgress.start();
            redirectInApp(router, `/manage?q=${encodeURIComponent(searchTerm)}`);
        }
    };

    return (
        <div className="grid gap-4">
            <TertiaryHeader
                title="Find User"
                description="Search for a user by name, ID, or type to view their details and manage their account."
            />
            <form onSubmit={handleSearch}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search for an account..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-12"
                    />
                    <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    >
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
            </form>
        </div>
    );
}
