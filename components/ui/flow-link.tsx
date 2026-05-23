'use client';

// FlowLink is a drop-in replacement for Next.js <Link> that automatically
// preserves backsTo and steps flow params from the current URL.
// Use it anywhere you would use <Link href="..."> for in-app navigation.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appendFlowParamsObject, getFlowParams } from '@/core/auth/callback';
import { appendApplicationRootMode } from '@/core/helpers/application-mode';
import type { ComponentProps } from 'react';
import { Suspense } from 'react';

type FlowLinkProps = ComponentProps<typeof Link>;

function FlowLinkInner({ href, ...props }: FlowLinkProps) {
  const searchParams = useSearchParams();
  const flowParams = getFlowParams(searchParams);
  const mode = searchParams.get('mode');

  const hrefString = typeof href === 'string' ? href : href.toString();
  const finalHref = appendApplicationRootMode(
    appendFlowParamsObject(hrefString, flowParams),
    mode,
  );

  return <Link href={finalHref} {...props} />;
}

export function FlowLink({ href, ...props }: FlowLinkProps) {
  return (
    <Suspense fallback={<Link href={href} {...props} />}>
      <FlowLinkInner href={href} {...props} />
    </Suspense>
  );
}
