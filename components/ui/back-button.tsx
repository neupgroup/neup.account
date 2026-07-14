
'use client';

import { ChevronLeft } from 'lucide-react';
import { cn } from '@/core/utils';
import { FlowLink } from '@/components/ui/flow-link';
import { goBack, hasBackHistory } from '@/core/helpers/navigation';

export function BackButton({ href, className }: { href: string, className?: string }) {
  return (
    <FlowLink
      href={href}
      className={cn("flex items-center gap-2 text-sm font-bold text-foreground hover:underline underline-offset-4", className)}
      onClick={(event) => {
        if (!hasBackHistory()) return;

        event.preventDefault();
        goBack(false);
      }}
    >
        <ChevronLeft className="h-4 w-4" />
        Go back
    </FlowLink>
  );
}
