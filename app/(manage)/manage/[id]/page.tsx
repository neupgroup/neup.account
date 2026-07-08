

import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { ListItem } from '@/components/ui/list-item';
import { getUserDetails } from '@/services/manage/users';
import { checkPermissions } from '@/services/user';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BackButton } from '@/components/ui/back-button';
import { VerifiedBadge } from '@/components/verified-badge';
import { UserCircle, ShieldCheck, History, Ban, Trash2, Gem } from '@/components/icons';
import { ACCOUNT_ACCESS_PERMISSION_GROUPS } from '@/core/auth/account-access-permissions';
import { permission } from '@/logica/permission';

const pagePermissions = [
  permission('root.account.view', 'for_individual', 'page'),
  permission('root.account.access.view', 'for_individual', 'page'),
];

const accountManagementFeatures = (accountId: string) => [
  {
    icon: UserCircle,
    title: 'Profile Information',
    description: 'View and manage user profile details.',
    href: `/profile?selectedProfile=${encodeURIComponent(accountId)}`,
  },
  {
    icon: ShieldCheck,
    title: 'Permissions',
    description: 'Assign or restrict permission sets for this user.',
    href: `/manage/${accountId}/permissions`,
  },
  {
    icon: ShieldCheck,
    title: 'Access',
    description: 'Grant direct access to other accounts without invitations.',
    href: `/access?selectedProfile=${encodeURIComponent(accountId)}`,
  },
  {
    icon: History,
    title: 'Account Activity',
    description: 'View a log of recent actions performed on this account.',
    href: `/manage/${accountId}/activity`,
  },
];

const adminActions = (accountId: string) => [
    {
        icon: ShieldCheck,
        title: 'Verification',
        description: 'Manage the user\'s verified status.',
        href: `/manage/${accountId}/verification`,
    },
    {
        icon: Ban,
        title: 'Bans & Warnings',
        description: 'Send warnings, block access, or take other admin actions.',
        href: `/manage/${accountId}/notice`,
    },
    {
        icon: Trash2,
        title: 'Deletion',
        description: 'Manage the account deletion process.',
        href: `/manage/${accountId}/deletion`,
    },
    {
        icon: Gem,
        title: 'Neup.Pro',
        description: 'Activate or deactivate the user\'s Pro subscription.',
        href: `/manage/${accountId}/pro`,
    }
]

export default async function AccountDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [canView, canViewAccess] = await Promise.all([
    checkPermissions(['root.account.view']),
    checkPermissions(ACCOUNT_ACCESS_PERMISSION_GROUPS.view),
  ]);
  if (!canView) {
    notFound();
  }

  const userDetails = await getUserDetails(id);

  if (!userDetails || !userDetails.profile) {
    notFound();
  }

  const features = accountManagementFeatures(id).filter((feature) =>
    feature.title !== 'Access' || canViewAccess,
  );
  const adminFeatures = adminActions(id);

  return (
    <div className="grid gap-8">
      <BackButton href="/manage" />
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage
            src={userDetails.profile.accountPhoto}
            alt={userDetails.profile.nameDisplay}
            data-ai-hint="person"
          />
          <AvatarFallback />
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {userDetails.profile.nameDisplay ||
                `${userDetails.profile.nameFirst} ${userDetails.profile.nameLast}`}
            </h1>
            {userDetails.profile.verified && <VerifiedBadge accountId={id} className="h-6 w-6" />}
          </div>
          <p className="text-muted-foreground font-mono">
            @{userDetails.profile.neupIdPrimary}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {features.map((feature, index) => (
            <ListItem
              key={index}
              href={feature.href}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </CardContent>
      </Card>
      
       <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">Administration Actions</h2>
             <Card>
                <CardContent className="divide-y p-0">
                {adminFeatures.map((feature, index) => (
                    <ListItem
                    key={index}
                    href={feature.href}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                    />
                ))}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
