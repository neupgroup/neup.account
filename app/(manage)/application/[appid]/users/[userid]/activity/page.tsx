import { ApplicationUserActivityPage } from '@/app/(manage)/application/_route-impl/users/[connId]/activity/page';

type Props = {
  params: Promise<{ appid: string; userid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApplicationUserActivityCanonicalPage({ params, searchParams }: Props) {
  const { appid, userid } = await params;
  await searchParams;
  return ApplicationUserActivityPage({ applicationId: appid, connId: userid });
}
