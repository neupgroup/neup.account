import { notFound } from "next/navigation";
import { getUserDetails } from "@/services/manage/users";
import { BackButton } from "@neup/components/element/backButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@neup/components/ui/card";

export default async function NoticeHistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const userDetails = await getUserDetails(id);
    if (!userDetails) {
        notFound();
    }
    
    return (
        <div className="grid gap-8">
            <BackButton href={`/manage/${id}`} />
            <div>
                <h1 className="font-bold tracking-tight text-2xl leading-8">Notice History</h1>
                <p className="text-muted-foreground text-sm leading-6">
                    A log of all warnings and notices sent to @{userDetails.neupId}.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg leading-7">Coming Soon</CardTitle>
                </CardHeader>
                 <CardContent>
                    <p className="text-sm text-muted-foreground">
                        This section will display a table of all historical notices.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
