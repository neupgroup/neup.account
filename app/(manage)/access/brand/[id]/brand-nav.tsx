
'use client';

import { FlowLink } from '@/components/flow-link';
import { usePathname } from 'next/navigation';
import { cn } from '#/core/utils';
import { Building, AppWindow, ShieldCheck, Users, UserCircle, ArrowLeft } from 'lucide-react';
import { Separator } from '#/components/ui/separator';

export function BrandNav({ brandId }: { brandId: string }) {
  const pathname = usePathname();
  const navItems = [
    { href: `/access/brand/${brandId}/info`, label: 'Profile', icon: UserCircle },
    { href: `/access/brand/${brandId}/users`, label: 'Users & Permissions', icon: Users },
    { href: `/access/brand/${brandId}/kyc`, label: 'KYC Verification', icon: ShieldCheck },
    { href: `/access/brand/${brandId}/platforms`, label: 'Platform Accounts', icon: AppWindow },
  ];

  return (
    <nav className="flex flex-col gap-1 text-sm font-medium">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <FlowLink
            key={item.href}
            href={item.href}
            className={cn('inline-flex items-center rounded-md px-4 py-2 text-sm font-medium justify-start gap-2', isActive ? 'bg-secondary text-secondary-foreground' : 'bg-transparent text-foreground hover:bg-primary/10')}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </FlowLink>
        );
      })}
       <Separator className="my-2" />
       <FlowLink
            href="/access"
            className="inline-flex items-center rounded-md px-4 py-2 text-sm font-medium justify-start gap-2 bg-transparent text-foreground hover:bg-primary/10"
          >
        <ArrowLeft className="h-4 w-4" />
        Back to Access
      </FlowLink>
    </nav>
  );
}
