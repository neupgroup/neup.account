
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card';
import { getConnectedApplications } from '@/services/applications/connected';
import { Button } from '#/components/ui/button';
import { FlowLink } from '#/components/ui/flow-link';
import { AppWindow, ChevronRight } from '@/components/icons';


export async function AccessCard() {
    const { firstParty, thirdParty } = await getConnectedApplications();
    const totalApps = firstParty.length + thirdParty.length;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Access & Sharing</CardTitle>
                <CardDescription>
                    You've granted {totalApps} app{totalApps === 1 ? '' : 's'} access to your data.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="space-y-2">
                    {firstParty.slice(0, 2).map((app) => (
                        <div key={app.id} className="flex items-center">
                            <AppWindow className="h-5 w-5 mr-3 text-muted-foreground" />
                            <span className="text-sm font-medium flex-grow">{app.name}</span>
                            <Button type="plain" size="sm" asChild>
                                <FlowLink href={`/data/1/${app.id}`}>Manage</FlowLink>
                            </Button>
                        </div>
                    ))}
                    {thirdParty.slice(0, 1).map((app) => (
                         <div key={app.id} className="flex items-center">
                            <AppWindow className="h-5 w-5 mr-3 text-muted-foreground" />
                            <span className="text-sm font-medium flex-grow">{app.name}</span>
                            <Button type="plain" size="sm" asChild>
                                <FlowLink href={`/data/3/${app.id}`}>Manage</FlowLink>
                            </Button>
                        </div>
                    ))}
                 </div>
                 <Button type="outlined" className="w-full" asChild>
                    <FlowLink href="/data">View All Apps <ChevronRight className="ml-2 h-4 w-4" /></FlowLink>
                </Button>
            </CardContent>
        </Card>
    );
}
