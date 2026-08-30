
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Ban } from "@/components/icons";

export default function BlockedPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-muted">
            <Card className="mx-auto max-w-md w-full">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-destructive rounded-full p-3 w-fit mb-4">
                        <Ban className="h-8 w-8 text-destructive-foreground" />
                    </div>
                    <CardTitle className="text-2xl font-headline text-destructive">Access Denied</CardTitle>
                    <CardDescription>
                        You're not allowed to access this site.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-center text-muted-foreground">
                        Your account has been temporarily suspended. Please contact support if you believe this is an error.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
