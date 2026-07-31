import { ApplicationUserDetailsPage } from '@/app/(manage)/application/_route-impl/users/[connId]/page';

type Props = {
  params: Promise<{ appid: string; userid: string }>;
  searchParams: Promise<{
    mode?: string;
    query?: string;
    role?: string;
    status?: string;
    activeSince?: string;
    sort?: string;
  }>;
};

export default async function ApplicationUserDetailsCanonicalPage({ params, searchParams }: Props) {
  const { appid, userid } = await params;
  const { mode, query, role, status, activeSince, sort } = await searchParams;
  return ApplicationUserDetailsPage({
    appId: appid,
    connId: userid,
    mode,
    query,
    role,
    status,
    activeSince,
    sort,
  });
}
