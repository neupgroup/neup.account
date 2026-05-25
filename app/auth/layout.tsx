import { InactivityMonitor } from "@/components/auth/inactivity-monitor";
import { SecurityGuard } from "@/components/auth/security-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "@/components/icons";

export const dynamic = 'force-dynamic';

export default function AuthLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const missingKeys: string[] = [];
    if (!process.env.AUTH_PUBLIC_KEY) missingKeys.push('AUTH_PUBLIC_KEY');
    if (!process.env.AUTH_PRIVATE_KEY) missingKeys.push('AUTH_PRIVATE_KEY');

    if (process.env.NODE_ENV === 'production' && missingKeys.length > 0) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-muted p-4">
                <Card className="mx-auto max-w-md w-full">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-destructive rounded-full p-3 w-fit mb-4">
                            <AlertTriangle className="h-8 w-8 text-destructive-foreground" />
                        </div>
                        <CardTitle className="text-2xl font-headline text-destructive">Auth Misconfigured</CardTitle>
                        <CardDescription>
                            Authentication is disabled because required server keys are missing.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-center text-muted-foreground">
                            Missing: <span className="font-mono">{missingKeys.join(', ')}</span>
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <SecurityGuard>
            <InactivityMonitor />
            {children}
        </SecurityGuard>
    );
}
