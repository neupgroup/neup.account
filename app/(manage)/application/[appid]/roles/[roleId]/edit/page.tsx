import { RoleDetailsPage } from '@/app/(manage)/application/_route-impl/roles/[roleId]/page';

type Props = {
  params: Promise<{ appid: string; roleId: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function RoleInfoEditCanonicalPage({ params, searchParams }: Props) {
  const { appid, roleId } = await params;
  const { mode } = await searchParams;
  return RoleDetailsPage({ applicationId: appid, roleId, mode, editingInfo: true });
}
