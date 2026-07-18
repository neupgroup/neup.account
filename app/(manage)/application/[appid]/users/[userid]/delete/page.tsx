import { ApplicationUserDeletePage } from '@/app/(manage)/application/_route-impl/users/[connId]/delete/page';

type Props = {
  params: Promise<{ appid: string; userid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApplicationUserDeleteCanonicalPage({ params, searchParams }: Props) {
  const { appid, userid } = await params;
  await searchParams;
  return ApplicationUserDeletePage({ applicationId: appid, connId: userid });
}
