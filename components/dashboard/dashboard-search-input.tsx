'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@neup/components/ui/input';
import { Search } from 'lucide-react';
import { redirectInApp } from '@neup/core/helpers/link/navigation';

/** Routes homepage search interactions to the dedicated search page. */
export function DashboardSearchInput() {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  /** Opens the search page with the current search term, when present. */
  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    redirectInApp(router, query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  }

  return (
    <form onSubmit={handleSearch}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search settings, people, apps, invoices..."
          className="pl-10"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onClick={() => redirectInApp(router, '/search')}
        />
      </div>
    </form>
  );
}
