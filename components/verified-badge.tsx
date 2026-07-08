
'use client';

import { useEffect, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/core/helpers/utils';
import { getAccountVerification } from '@/services/manage/verifications';

type VerificationDetails = {
    category: string;
    verifiedAt: string;
};

export function VerifiedBadge({ accountId, className }: { accountId: string, className?: string }) {
    const [isVerified, setIsVerified] = useState<boolean>(false);
    const [verificationDetails, setVerificationDetails] = useState<VerificationDetails | null>(null);

    useEffect(() => {
        if (!accountId) return;

        const checkVerification = async () => {
            try {
                const data = await getAccountVerification(accountId);
                if (data && data.verified) {
                    setIsVerified(true);
                    setVerificationDetails({
                        category: data.category || 'Standard',
                        verifiedAt: data.verifiedAt || 'N/A',
                    });
                } else {
                    setIsVerified(false);
                }
            } catch (error) {
                console.error("Error fetching verification status:", error);
                setIsVerified(false);
            }
        };

        checkVerification();
    }, [accountId]);

    if (!isVerified) {
        return null;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <CheckCircle2 className={cn("h-6 w-6 text-primary fill-blue-100", className)} />
                </TooltipTrigger>
                {verificationDetails && (
                    <TooltipContent>
                        <p className="font-semibold">Verified as {verificationDetails.category}</p>
                        <p className="text-xs text-muted-foreground">
                            Date: {verificationDetails.verifiedAt}
                        </p>
                    </TooltipContent>
                )}
            </Tooltip>
        </TooltipProvider>
    );
}
