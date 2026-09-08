
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";

export default function BrandUsersPage() {
    return (
        <div className="grid gap-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg leading-7">Users & Permissions</CardTitle>
                    <CardDescription className="text-sm leading-6">
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
