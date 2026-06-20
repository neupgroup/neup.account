import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "@/components/icons";

export default function UnsecurePage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-muted">
            <Card className="mx-auto max-w-md w-full">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-destructive rounded-full p-3 w-fit mb-4">
                        <Shield className="h-8 w-8 text-destructive-foreground" />
                    </div>
                    <CardTitle className="text-2xl font-headline text-destructive">Insecure Connection</CardTitle>
                    <CardDescription>
                        Your connection is not secure.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-center text-muted-foreground">
                        NeupID requires a secure HTTPS connection to protect your credentials. Please access this site over HTTPS.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
