import { AddRolePage } from '@/app/(manage)/application/_route-impl/roles/add/page';

type Props = {
  params: Promise<{ appid: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function AddRoleCanonicalPage({ params, searchParams }: Props) {
  const { appid } = await params;
  const { mode } = await searchParams;
  return AddRolePage({ applicationId: appid, mode });
}
