import { ApplicationLogsPage } from '@/app/(manage)/application/_route-impl/logs/page';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{
    mode?: string;
    endpoint?: string;
    status?: string;
    q?: string;
    limit?: string;
  }>;
};

export default async function ApplicationLogsCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  return ApplicationLogsPage({ applicationId: appid, searchParams: await searchParams });
}
