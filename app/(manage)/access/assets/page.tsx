import AssetPage from '@/app/(manage)/access/asset/page';

type Props = {
  searchParams: Promise<{ asset?: string; mode?: string }>;
};

export default async function AssetsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { mode: _mode, ...rest } = params;
  return AssetPage({
    searchParams: Promise.resolve(rest),
  });
}
