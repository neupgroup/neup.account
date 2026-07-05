
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPaymentDetails, getAppInfo } from "@/services/manage/payments/neup.pro";
import Image from "next/image";
import { Bot, Instagram, Linkedin, Ban } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { checkPermissions } from '@/services/user';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { notFound } from "next/navigation";
import { permission } from '@/neup.logica/permission';

const pagePermissions = [
    permission('payment.purchase_neup_pro.view', 'for_individual', 'page'),
];

export default async function NeupProPage() {
    const canView = await checkPermissions(['payment.purchase_neup_pro.view']);
    if (!canView) {
        notFound();
    }
    
    const [details, appInfo] = await Promise.all([
        getPaymentDetails(),
        getAppInfo(),
    ]);

    const whatsappHref = appInfo?.whatsappContact
        ? (appInfo.whatsappContact.startsWith('http')
            ? appInfo.whatsappContact
            : `https://wa.me/${appInfo.whatsappContact.replace(/\D/g, '')}`)
        : undefined;

    const instagramHref = appInfo?.instagramContact
        ? (appInfo.instagramContact.startsWith('http')
            ? appInfo.instagramContact
            : `https://ig.me/m/${appInfo.instagramContact.replace(/^@/, '')}`)
        : undefined;

    const linkedinHref = appInfo?.linkedinContact;

    if (!details || !appInfo) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Service Unavailable</CardTitle>
                    <CardDescription>
                       Payment details are not configured at the moment. Please check back later.
                    </CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <div className="grid gap-8">
            <BackButton href="/payment" />
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Purchase Neup.Pro</h1>
                <p className="text-muted-foreground">
                    Upgrade your account to unlock exclusive features and benefits.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Payment Instructions</CardTitle>
                    <CardDescription>
                        To activate your Neup.Pro subscription, please follow the steps below.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="space-y-4">
                        <h3 className="font-semibold">Step 1: Make Payment</h3>
                        <p className="text-sm text-muted-foreground">Pay the subscription amount using one of the methods below.</p>
                        <div className="grid md:grid-cols-2 gap-8 items-start">
                             {details.qrCodeUrl && (
                                <div className="space-y-2 flex flex-col items-center">
                                    <h4 className="font-medium">Scan QR Code</h4>
                                    <Image
                                        src={details.qrCodeUrl}
                                        alt="Payment QR Code"
                                        width={250}
                                        height={250}
                                        className="rounded-lg border"
                                        data-ai-hint="qr code"
                                    />
                                </div>
                            )}
                            {details.bankDetails && (
                                <div className="space-y-2">
                                    <h4 className="font-medium">Bank Transfer</h4>
                                    <div className="text-sm p-4 rounded-md bg-muted/50 whitespace-pre-line font-mono">
                                        {details.bankDetails}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h3 className="font-semibold">Step 2: Send Proof of Payment</h3>
                        <p className="text-sm text-muted-foreground">
                            Send us a screenshot or statement of your transaction from your registered phone number via one of the following channels.
                        </p>
                         <div className="flex flex-wrap gap-4">
                            {whatsappHref && (
                                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-green-500 hover:underline">
                                    <Bot className="h-5 w-5" /> WhatsApp
                                </a>
                            )}
                             {instagramHref && (
                                <a href={instagramHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-pink-500 hover:underline">
                                    <Instagram className="h-5 w-5" /> Instagram
                                </a>
                            )}
                            {linkedinHref && (
                                <a href={linkedinHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-sky-500 hover:underline">
                                    <Linkedin className="h-5 w-5" /> LinkedIn
                                </a>
                            )}
                         </div>
                    </div>
                     <div className="space-y-2">
                        <h3 className="font-semibold">Step 3: Activation</h3>
                        <p className="text-sm text-muted-foreground">
                            Once we verify your payment, your Neup.Pro subscription will be activated on your account.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

    
