import { FlowLink } from '#/components/ui/flow-link';
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
          <h1 className="text-3xl font-bold tracking-tight">Add Application</h1>
          <p className="text-muted-foreground">Create a new application.</p>
        </div>
        <Button type="outlined" asChild>
          <FlowLink href="/application">Back to Applications</FlowLink>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Name your application</CardTitle>
          <CardDescription>Choose the fixed app ID prefix, then confirm the generated or custom second part before creating.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
