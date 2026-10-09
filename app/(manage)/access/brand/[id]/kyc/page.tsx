
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@neup/components/ui/card";

export default function BrandKycPage() {
    return (
        <div className="grid gap-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg leading-7">KYC Verification</CardTitle>
                    <CardDescription className="text-sm leading-6">
                        Manage Know Your Customer (KYC) settings and documents for this brand.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">This feature is coming soon.</p>
                </CardContent>
            </Card>
        </div>
    );
}
