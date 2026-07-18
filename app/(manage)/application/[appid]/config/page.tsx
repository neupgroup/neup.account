import { ApplicationConfigPage } from '@/app/(manage)/application/_route-impl/config/page';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function ApplicationConfigCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode } = await searchParams;
  return ApplicationConfigPage({ applicationId: appid, mode });
}
