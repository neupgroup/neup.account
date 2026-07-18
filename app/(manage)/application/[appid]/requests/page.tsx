import { ApplicationRequestsPage } from '@/app/(manage)/application/_route-impl/requests/page';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function ApplicationRequestsCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode } = await searchParams;
  return ApplicationRequestsPage({ applicationId: appid, mode });
}
