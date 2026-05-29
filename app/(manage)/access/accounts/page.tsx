import { notFound } from 'next/navigation';
import { BackButton } from '@/components/ui/back-button';
import { PrimaryHeader } from '@/components/ui/primary-header';
import { SecondaryHeader } from '@/components/ui/secondary-header';
import { Card, CardContent } from '@/components/ui/card';
import { getActiveAccountId } from '@/core/auth/verify';
import { getAccessibleAccounts } from '@/services/manage/accounts';
import { AccountListItem } from '@/components/elements/account-item';

export default async function AccessAccountsPage() {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const accounts = await getAccessibleAccounts();

  return (
    <div className="grid gap-8">
      <BackButton href="/access" />

      <PrimaryHeader
        title="Accessible Accounts"
        description="All accounts your profile can access."
      />

      <div className="space-y-2">
        <SecondaryHeader
          title="Accounts"
          description="Switch to any account listed below."
        />
        <Card>
          <CardContent className="p-0 divide-y">
            {accounts.length > 0 ? (
              accounts.map((account) => (
                <AccountListItem key={account.aid} account={account} />
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No accessible accounts found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
