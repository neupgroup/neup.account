import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplicationDetailPage } from '@/app/(manage)/application/_components/application-detail-page';
import { getApplicationMode } from '@/app/(manage)/application/_lib/query-param';
import { formMetadata } from '@/core/metadata';
import {
  canCurrentAccountUseRootApplicationMode,
  getApplicationDetailsForViewerV2,
  logRootApplicationActivity,
} from '@/services/applications/manage';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string; tab?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { appid } = await params;
  const { mode } = await searchParams;
  const rootMode = getApplicationMode(mode) === 'root';

  if (rootMode) {
    const canUseRootMode = await canCurrentAccountUseRootApplicationMode();
    if (!canUseRootMode) {
      return formMetadata({ title: 'Application Management' });
    }
  }

  const details = await getApplicationDetailsForViewerV2(appid, {
    rootMode,
  });
  return formMetadata({
    title: details?.name ? `${details.name}'s Management` : 'Application Management',
  });
}

export default async function ApplicationCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode } = await searchParams;
  const resolvedMode = getApplicationMode(mode);

  if (resolvedMode === 'root') {
    const canUseRootMode = await canCurrentAccountUseRootApplicationMode();
    if (!canUseRootMode) notFound();
    await logRootApplicationActivity(appid, 'overview');
  }

  return <ApplicationDetailPage applicationId={appid} mode={resolvedMode} />;
}
