import { ApplicationUserRolesPage } from '@/app/(manage)/application/_route-impl/users/[connId]/roles/page';
import { getQueryParam } from '@/app/(manage)/application/_lib/query-param';

type Props = {
  params: Promise<{ appid: string; userid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApplicationUserRolesCanonicalPage({ params, searchParams }: Props) {
  const { appid, userid } = await params;
  const { mode } = await searchParams;
  return ApplicationUserRolesPage({ applicationId: appid, connId: userid, mode: getQueryParam(mode) });
}
