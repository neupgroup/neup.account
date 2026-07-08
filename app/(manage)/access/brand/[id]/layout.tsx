import { notFound } from 'next/navigation';
import { getUserProfile, checkPermissions } from '@/services/user';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BrandNav } from './brand-nav';
import { BackButton } from '@/components/ui/back-button';
import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import { permission } from '@/neup.logica/permission';

const layoutPermissions = [
  permission('linked_accounts.brand.manage', 'for_brand', 'layout'),
];

export default async function BrandManagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  await requireAnyPermission404(['linked_accounts.brand.manage']);
  const [canManageBrand, brandProfile] = await Promise.all([
    checkPermissions(['linked_accounts.brand.manage']),
    getUserProfile(resolvedParams.id)
  ]);
  
  if (!canManageBrand || !brandProfile) {
    notFound();
  }

  return (
    <div className="grid md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] gap-8 items-start">
      <div className="flex flex-col gap-4 sticky top-24">
        <BackButton href="/access" />
         <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
                <AvatarImage src={brandProfile.accountPhoto} alt={brandProfile.nameDisplay} data-ai-hint="logo" />
                <AvatarFallback />
            </Avatar>
            <div>
                <h2 className="text-xl font-bold tracking-tight">{brandProfile.nameDisplay}</h2>
                <p className="text-sm text-muted-foreground">Brand Management</p>
            </div>
        </div>
        <BrandNav brandId={resolvedParams.id} />
      </div>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
