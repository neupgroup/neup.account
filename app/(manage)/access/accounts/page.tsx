import { notFound } from 'next/navigation';
import { BackButton } from '#/components/element/backButton';
import { TitleSet } from '#/components/element/titleset';
import { Card, CardContent } from '#/components/ui/card';
import { getActiveAccountId } from '@/services/account/verify';
import { getAccessibleAccounts } from '@/services/manage/accounts';
import { AccountListItem } from '@/components/elements/account-item';

export default async function AccessAccountsPage() {
  const accountId = await getActiveAccountId();
  if (!accountId) notFound();

  const accounts = await getAccessibleAccounts();

  return (
    <div className="grid gap-8">
      <BackButton href="/access" />

      <TitleSet level={1}
        title="Accessible Accounts"
        subtitle="All accounts your profile can access."
      />

      <div className="space-y-2">
        <TitleSet level={1}
          title="Accounts"
          subtitle="Switch to any account listed below."
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
