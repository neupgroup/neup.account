
import { Card, CardContent } from "#/components/ui/card";
import React from "react";
import { checkPermissions } from '@/services/user';
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { ListItem } from "@/components/ui/ListItem";
import { SecondaryHeader } from "#/components/ui/secondary-header";
import { PrimaryHeader } from "#/components/ui/primary-header";
import { CreditCard, History, Wallet, Gem, Ban } from "@/components/icons";
import { permission } from '@/.neup/logica/permission';

const pagePermissions = [
    permission('payment.method.show', 'for_individual', 'page'),
    permission('payment.transactions.show', 'for_individual', 'page'),
    permission('payment.subscriptions.show', 'for_individual', 'page'),
    permission('payment.purchase_neup_pro.view', 'for_individual', 'page'),
];

export default async function PaymentSubscriptionPage() {
    const [canViewMethods, canViewHistory, canViewSubscriptions, canViewNeupPro] = await Promise.all([
        checkPermissions(['payment.method.show']),
        checkPermissions(['payment.transactions.show']),
        checkPermissions(['payment.subscriptions.show']),
        checkPermissions(['payment.purchase_neup_pro.view']),
    ]);

    const features = [
        {
            icon: CreditCard,
            title: "Payment Methods",
            description: "Manage your saved payment methods.",
            href: "https://neupgroup.com/wallet/methods",
            isExternal: true,
            show: canViewMethods,
        },
        {
            icon: History,
            title: "Transactions History",
            description: "View your past purchases and transactions.",
            href: "https://neupgroup.com/wallet/history?source=neup",
            isExternal: true,
            show: canViewHistory,
        },
        {
            icon: Wallet,
            title: "Subscriptions",
            description: "Manage your active subscriptions with Neup and third-parties.",
            href: "https://neupgroup.com/wallet/subscriptions",
            isExternal: true,
            show: canViewSubscriptions,
        },
        {
            icon: Gem,
            title: "Purchase Neup.Pro",
            description: "Upgrade your account to access premium features.",
            href: "/payment/neup.pro",
            show: canViewNeupPro,
        },
    ];

    const visibleFeatures = features.filter(f => f.show);

    return (
        <div className="grid gap-8">
            <PrimaryHeader
                title="Payment & Subscription"
                description="Manage your billing information, subscriptions, and view purchase history."
            />
             <div className="grid gap-4">
                <SecondaryHeader
                    title="Your Wallet"
                    description="Review your payment settings and upgrade your plan."
                />
                <Card>
                    <CardContent className="divide-y p-0">
                        {visibleFeatures.length > 0 ? (
                            visibleFeatures.map((feature, index) => (
                                <ListItem key={index} {...feature} />
                            ))
                        ) : (
                             <div className="p-4 text-center text-sm text-muted-foreground">
                                You do not have permission to view payment and subscription settings.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
