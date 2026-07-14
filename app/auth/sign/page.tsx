import { FlowLink } from '@/components/ui/flow-link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppWindow } from '@/components/icons';
import { getAuthSignPageData } from '@/services/account/signPage';
import Image from 'next/image';

type SignPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// ── App logo + name ───────────────────────────────────────────────────────────

function AppIdentity({ icon, name }: { icon: string | null; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted/40 overflow-hidden">
        {icon ? (
          <Image
            src={icon}
            alt={name}
            width={28}
            height={28}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <AppWindow className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <p className="text-sm font-medium leading-none">{name}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AuthSignPage({ searchParams }: SignPageProps) {
  const resolvedSearchParams = await searchParams;
  const pageData = await getAuthSignPageData(resolvedSearchParams);

  if (pageData.redirectTo) {
    redirect(pageData.redirectTo);
  }

  const {
    step,
    application,
    displayAppName,
    appIcon,
    userDisplayName,
    hasActiveSession,
    startPageUrl,
    cancelUrl,
    continueUrl,
    accessItems,
    policies,
    profileNextUrl,
    accessNextUrl,
    accessBackUrl,
    termsBackUrl,
  } = pageData;

  // ── Not signed in ─────────────────────────────────────────────────────────
  if (!hasActiveSession) {
    return (
      <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
        <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
          <CardHeader>
            <AppIdentity icon={appIcon} name={displayAppName} />
            <div className="pt-4 space-y-1">
              <CardTitle className="text-2xl font-headline">Sign in to continue</CardTitle>
              <CardDescription>
                Sign in with your NeupID to continue to{' '}
                <span className="font-medium text-foreground">{displayAppName}</span>.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              <FlowLink href={startPageUrl}>Sign In or Create Account</FlowLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step 1: Welcome / Profile ─────────────────────────────────────────────
  if (step === 'profile') {
    return (
      <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
        <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
          <CardHeader>
            <AppIdentity icon={appIcon} name={displayAppName} />
            <div className="pt-4 space-y-1">
              <CardTitle className="text-2xl font-headline">
                Welcome, {userDisplayName}
              </CardTitle>
              <CardDescription className="text-sm">
                <span className="font-medium text-foreground">{displayAppName}</span>
                {' '}is requesting access to your basic information.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button asChild variant="outline" className="w-full">
                <a href={cancelUrl}>Cancel</a>
              </Button>
              <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                <FlowLink href={profileNextUrl}>Continue</FlowLink>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step 2: Access ────────────────────────────────────────────────────────
  if (step === 'access') {
    return (
      <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
        <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
          <CardHeader>
            <AppIdentity icon={appIcon} name={displayAppName} />
            <div className="pt-4 space-y-1">
              <CardTitle className="text-2xl font-headline">Data Access</CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">{displayAppName}</span>
                {' '}will have access to the following information from your account.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="rounded-lg border divide-y overflow-hidden">
              {accessItems.map((item) => (
                <li key={item} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Button asChild variant="outline" className="w-full">
                <FlowLink href={accessBackUrl}>Back</FlowLink>
              </Button>
              <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                <FlowLink href={accessNextUrl}>Continue</FlowLink>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step 3: Terms ─────────────────────────────────────────────────────────
  if (step === 'terms') {
    const hasPolicies = policies.length > 0;

    return (
      <div className="flex min-h-screen items-start justify-center bg-card md:bg-background md:items-center">
        <Card className="mx-auto max-w-lg w-full border-0 shadow-none md:border md:shadow-sm">
          <CardHeader>
            <AppIdentity icon={appIcon} name={displayAppName} />
            <div className="pt-4 space-y-1">
              <CardTitle className="text-2xl font-headline">Terms &amp; Conditions</CardTitle>
              <CardDescription>
                By continuing, you agree to the following terms and conditions set by{' '}
                <span className="font-medium text-foreground">{displayAppName}</span>.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
              {hasPolicies ? (
                policies.map((p) => (
                  <div key={p.name} className="px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {p.name}
                    </p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {p.policy}
                    </p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  By continuing, you agree to this application&apos;s terms and data usage rules.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Button asChild variant="outline" className="w-full">
                <FlowLink href={termsBackUrl}>Back</FlowLink>
              </Button>
              <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                <a href={continueUrl}>Agree &amp; Continue</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  redirect(startPageUrl);
}
