
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BrandUsersPage() {
    return (
        <div className="grid gap-8">
            <Card>
                <CardHeader>
                    <CardTitle>Users & Permissions</CardTitle>
                    <CardDescription>
                        Manage users who have access to this brand and their permissions.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">This feature is coming soon.</p>
                </CardContent>
            </Card>
        </div>
    );
}
