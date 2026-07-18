import { RoleDetailsPage } from '@/app/(manage)/application/_route-impl/roles/[roleId]/page';

type Props = {
  params: Promise<{ appid: string; roleId: string }>;
  searchParams: Promise<{ mode?: string; edit?: string }>;
};

export default async function RoleDetailsCanonicalPage({ params, searchParams }: Props) {
  const { appid, roleId } = await params;
  const { mode, edit } = await searchParams;
  return RoleDetailsPage({ applicationId: appid, roleId, mode, edit });
}
