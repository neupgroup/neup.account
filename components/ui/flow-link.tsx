'use client';

// FlowLink is a drop-in replacement for Next.js <Link> that automatically
// preserves backsTo and steps flow params from the current URL.
// Use it anywhere you would use <Link href="..."> for in-app navigation.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appendFlowParamsObject, getFlowParams } from '@/core/auth/callbacks';
import { appendApplicationRootMode } from '@/app/(manage)/application/_lib/application-mode';
import { appendStickyQueryParams } from '@/core/helpers/navigation';
import type { ComponentProps } from 'react';
import { Suspense } from 'react';

type FlowLinkProps = ComponentProps<typeof Link>;

/**
 * ::neup.documentation::flow-link-component
 * ::title Flow Link
 *
 * Link wrapper that preserves flow-related and sticky query parameters during in-app navigation.
 *
 * ::public
 *
 * Use this component anywhere a normal Next.js `Link` should keep flow params like callback state or root-mode query state intact.
 *
 * ::public end
 *
 * ::private
 *
 * The suspense fallback renders a plain `Link`, while the hydrated path appends flow params, sticky params, and application root mode from the current URL.
 *
 * ::private end
 *
 * ::end
 */
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
