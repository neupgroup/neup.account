import { FlowLink } from '@/components/flow-link';
import { forbidden } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { Button } from '#/components/ui/button';
import { ApplicationCreateForm } from '@/app/(manage)/application/_components/application-create-form';
import { canCurrentAccountCreateApplication } from '@/services/applications/manage';

export default async function AddApplicationPage() {
  const canCreateApplication = await canCurrentAccountCreateApplication();
  if (!canCreateApplication) {
    forbidden();
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-bold tracking-tight text-2xl leading-8">Add Application</h1>
          <p className="text-muted-foreground text-sm leading-6">Create a new application.</p>
        </div>
        <Button variant="outlined" asChild>
          <FlowLink href="/application">Back to Applications</FlowLink>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg leading-7">Name your application</CardTitle>
          <CardDescription className="text-sm leading-6">Choose the fixed app ID prefix, then confirm the generated or custom second part before creating.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
