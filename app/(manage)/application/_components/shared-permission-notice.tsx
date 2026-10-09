import prisma from '@neup/core/database/prisma';
import { BackButton } from '@neup/components/element/backButton';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@neup/components/ui/card';
import { FlowLink } from '@/components/flow-link';
import { applicationHref } from '@/app/(manage)/application/_lib/query-param';

export async function SharedPermissionNotice({ appId, sourceId, mode }: {
  appId: string;
  sourceId: string;
  mode?: string;
}) {
  const source = await prisma.application.findUnique({ where: { id: sourceId }, select: { name: true } });
  const query = mode ? { mode } : undefined;
  return (
    <div className="grid gap-8">
      <BackButton backsTo={applicationHref('/application', appId, query)} />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg leading-7">Permissions managed by another application</CardTitle>
          <CardDescription className="text-sm leading-6">
            This application's permissions are managed from {source?.name ?? sourceId} ({sourceId}).
            Create, edit, and delete roles and permissions in that application.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <FlowLink className="font-medium underline underline-offset-4" href={applicationHref('/application/roles', sourceId, query)}>
            Open source application roles
          </FlowLink>
          <FlowLink className="font-medium underline underline-offset-4" href={applicationHref('/application/permissions', sourceId, query)}>
            Open source application permissions
          </FlowLink>
          <FlowLink className="underline underline-offset-4" href={applicationHref('/application/config', appId, query)}>
            Change permission source
          </FlowLink>
        </CardContent>
      </Card>
    </div>
  );
}
