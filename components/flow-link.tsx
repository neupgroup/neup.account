'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';
import { Suspense } from 'react';
import { appendFlowParamsObject, getFlowParams } from '@/inapp/auth/callbacks';
import { appendApplicationRootMode } from '@/app/(manage)/application/_lib/application-mode';
import { appendStickyQueryParams } from '#/core/helpers/link/navigation';

type FlowLinkProps = ComponentProps<typeof Link>;

function FlowLinkInner({ href, ...props }: FlowLinkProps) {
  const searchParams = useSearchParams();
  const flowParams = getFlowParams(searchParams);
  const mode = searchParams.get('mode');

  const hrefString = typeof href === 'string' ? href : href.toString();
  const finalHref = appendApplicationRootMode(
    appendStickyQueryParams(
      appendFlowParamsObject(hrefString, flowParams),
      searchParams,
    ),
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
