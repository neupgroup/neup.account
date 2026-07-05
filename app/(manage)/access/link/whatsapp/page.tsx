import type { Metadata } from 'next';
import { createPageMetadata } from '@/neup.core/metadata';
import LinkWhatsAppPageClient from './page.client';

export const metadata: Metadata = createPageMetadata('Link WhatsApp');

type PageProps = {
  searchParams: Promise<{ selectedProfile?: string; mode?: string; workingProfile?: string }>;
};

function buildAccessHref(pathname: string, context: { selectedProfile?: string; mode?: string; workingProfile?: string }) {
  const [basePathname, query = ''] = pathname.split('?', 2);
  const params = new URLSearchParams(query);

  if (context.selectedProfile) params.set('selectedProfile', context.selectedProfile);
  if (context.mode) params.set('mode', context.mode);
  if (context.workingProfile) params.set('workingProfile', context.workingProfile);

  const nextQuery = params.toString();
  return nextQuery ? `${basePathname}?${nextQuery}` : basePathname;
}

export default async function LinkWhatsAppPage({ searchParams }: PageProps) {
  const { selectedProfile, mode, workingProfile } = await searchParams;
  const hrefContext = { selectedProfile, mode, workingProfile };

  return (
    <LinkWhatsAppPageClient
      managerAccountId={selectedProfile}
      backHref={buildAccessHref('/access/link', hrefContext)}
    />
  );
}
