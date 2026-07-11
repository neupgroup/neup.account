
'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/core/utils';
import { FlowLink } from '@/components/ui/flow-link';
import { hasPreviousInAppPath } from '@/core/helpers/back-navigation';

export function BackButton({ href, className }: { href: string, className?: string }) {
  const router = useRouter();

  return (
    <FlowLink
      href={href}
      className={cn("flex items-center gap-2 text-sm font-bold text-foreground hover:underline underline-offset-4", className)}
      onClick={(event) => {
        if (!hasPreviousInAppPath()) return;

        event.preventDefault();
        router.back();
      }}
    >
        <ChevronLeft className="h-4 w-4" />
        Go back
    </FlowLink>
  );
}
