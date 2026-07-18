import { ApplicationEditPage } from '@/app/(manage)/application/_route-impl/edit/page';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function ApplicationEditCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode } = await searchParams;
  return ApplicationEditPage({ applicationId: appid, mode });
}
