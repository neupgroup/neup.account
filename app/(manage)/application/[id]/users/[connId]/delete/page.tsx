import { ArrowLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowLink } from '@/components/ui/flow-link';

type Props = { params: Promise<{ id: string; connId: string }> };

export default async function ApplicationUserDeletePage({ params }: Props) {
  const { id, connId } = await params;

  return (
    <div className="grid gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 text-muted-foreground">
          <FlowLink href={`/application/${id}/users/${connId}?mode=root`}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </FlowLink>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Account removal flow for this application user will be added here.
        </CardContent>
      </Card>
    </div>
  );
}
