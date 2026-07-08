
"use client";

import { useState, useEffect, useTransition } from 'react';
import { useToast } from '@/core/hooks/use-toast';
import { getBackupCodes, generateBackupCodes, type BackupCode } from '@/services/security/backup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download, Copy, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BackButton } from '@/components/ui/back-button';
import { SecondaryHeader } from '@/components/ui/secondary-header';

export default function BackupCodesPage() {
    const [codes, setCodes] = useState<BackupCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const fetchCodes = async () => {
        setLoading(true);
        const fetchedCodes = await getBackupCodes();
        setCodes(fetchedCodes);
        setLoading(false);
    };

    useEffect(() => {
        fetchCodes();
    }, []);

    const handleGenerate = () => {
        startTransition(async () => {
            const newCodes = await generateBackupCodes();
            setCodes(newCodes);
            toast({
                title: "New codes generated",
                description: "Your old codes have been invalidated.",
                className: 'bg-accent text-accent-foreground'
            });
        });
    };

    const handleCopy = () => {
        const codesToCopy = codes.map(c => c.code).join('\n');
        navigator.clipboard.writeText(codesToCopy);
        toast({ title: 'Codes copied to clipboard' });
    };

    const handleDownload = () => {
        const codesToDownload = codes.map(c => c.code).join('\n');
        const blob = new Blob([codesToDownload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'neupid-backup-codes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };


    return (
        <div className="grid gap-8">
            <BackButton href="/manage/security" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Backup Codes</h1>
                <p className="text-muted-foreground">
                    Store these codes in a safe place. They can be used to sign in if you lose access to your other recovery methods.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <SecondaryHeader
                        title="Your Backup Codes"
                        description="Each code can only be used once. Generate new codes to invalidate this set."
                    />
                </CardHeader>
                <CardContent className="space-y-6">
                     <Alert variant="destructive">
                        <AlertTitle>Store these codes securely!</AlertTitle>
                        <AlertDescription>
                            Treat these codes like your password. Anyone with access to these codes can sign in to your account.
                        </AlertDescription>
                    </Alert>

                    {loading ? (
                        <div className="grid grid-cols-2 gap-4">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />
                            ))}
                        </div>
                    ) : codes.length > 0 ? (
                        <>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-4 font-mono text-lg tracking-wider">
                                {codes.map((code) => (
                                    <p key={code.code} className={code.used ? 'text-muted-foreground line-through' : ''}>
                                        {code.code.substring(0, 4)} {code.code.substring(4)}
                                    </p>
                                ))}
                            </div>
                             <div className="flex flex-wrap gap-2 pt-4 border-t">
                                <Button onClick={handleCopy} variant="outline" size="sm" disabled={isPending}>
                                    <Copy className="mr-2 h-4 w-4" /> Copy Codes
                                </Button>
                                <Button onClick={handleDownload} variant="outline" size="sm" disabled={isPending}>
                                    <Download className="mr-2 h-4 w-4" /> Download
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">
                            You don't have any backup codes yet.
                        </p>
                    )}

                    <div className="pt-6 border-t">
                         <Button onClick={handleGenerate} disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            {codes.length > 0 ? 'Generate New Codes' : 'Generate Codes'}
                        </Button>
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}
