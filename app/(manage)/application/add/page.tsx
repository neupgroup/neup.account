import { FlowLink } from '@/components/ui/flow-link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ApplicationCreateForm } from '@/app/(manage)/application/_components/application-create-form';
import { checkPermissions } from '@/services/user';

export default async function AddApplicationPage() {
  const canCreateApplication = await checkPermissions(['root.application.create']);
  if (!canCreateApplication) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Application</h1>
          <p className="text-muted-foreground">Create a new application.</p>
        </div>
        <Button variant="outline" asChild>
          <FlowLink href="/application">Back to Applications</FlowLink>
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Name your application</CardTitle>
          <CardDescription>Enter only the application name to create it.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
