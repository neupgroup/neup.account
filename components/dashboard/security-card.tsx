import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { getUserSessions } from '@/services/security/sessions';
import { Button } from '#/components/ui/button';
import { FlowLink } from '#/components/ui/flow-link';
import { Laptop, ChevronRight } from '@/components/icons';


export async function SecurityCard() {
    const sessions = await getUserSessions();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Security & Sessions</CardTitle>
                <CardDescription>
                    {sessions.length} active device{sessions.length === 1 ? '' : 's'}. Trust only the devices you recognize.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="space-y-2">
                    {sessions.slice(0, 3).map((session) => (
                        <div key={session.id} className="flex items-center">
                            <Laptop className="h-5 w-5 mr-3 text-muted-foreground" />
                            <span className="text-sm font-medium flex-grow truncate">{session.userAgent}</span>
                            <span className="text-xs text-muted-foreground">{session.lastLoggedIn}</span>
                        </div>
                    ))}
                 </div>
                 <Button type="outlined" className="w-full" asChild>
                    <FlowLink href="/security/devices">Manage All Devices <ChevronRight className="ml-2 h-4 w-4" /></FlowLink>
                </Button>
            </CardContent>
        </Card>
    );
}
