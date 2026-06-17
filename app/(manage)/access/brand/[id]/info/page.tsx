

import { BrandProfileForm } from '@/app/(manage)/profile/brand-form';

export default async function BrandInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line react/no-children-prop
  return <BrandProfileForm accountId={id} children={undefined} />;
}
