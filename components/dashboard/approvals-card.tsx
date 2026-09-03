import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { Button } from '#/components/ui/button';
import { FlowLink } from '@/components/flow-link';
import { getNotifications } from '@/services/notifications';
import { Badge } from '#/components/ui/badge';
import { UserCheck } from '@/components/icons';


export async function ApprovalsCard() {
    const { requests } = await getNotifications();

    if (requests.length === 0) {
        return null;
    }
    
    function getActionText(action: string, senderName: string): string {
        if (action === 'family_invitation') {
            return `${senderName} has invited you to join their family.`;
        }
        if (action === 'neupid_request') {
            return `${senderName} has requested a new NeupID.`;
        }
        if (action === 'access_invitation') {
            return `${senderName} wants to manage your account.`;
        }
        return 'You have a new request.';
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle>Requests & Approvals</CardTitle>
                <CardDescription>
                    {requests.length} request{requests.length === 1 ? '' : 's'} awaiting your review.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3">
                    {requests.slice(0, 3).map((req) => (
                        <li key={req.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <UserCheck className="h-5 w-5 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">{req.senderName}</p>
                                    <p className="text-xs text-muted-foreground">{getActionText(req.action, req.senderName || '')}</p>
                                </div>
                            </div>
                            <Button asChild variant="tinted" size="sm">
                                <FlowLink href={'/manage/notifications'}>Review</FlowLink>
                            </Button>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
