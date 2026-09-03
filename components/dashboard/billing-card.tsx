
"use client"

import { Card, CardContent } from '#/components/ui/card';
import { Wallet, Gem } from '@/components/icons';
import { ListItem } from '@/components/ui/ListItem';
import { TitleSet } from '#/components/element/titleset';
import { useEffect, useState } from 'react';
import { Skeleton } from '#/components/ui/skeleton';

function BillingCardSkeleton() {
    return (
         <div className="space-y-2">
            <div className="space-y-1">
                <Skeleton className="h-6 w-1/4" />
                <Skeleton className="h-4 w-2/5" />
            </div>
            <Card>
                <CardContent className="divide-y p-2">
                    <div className="flex items-center gap-4 py-4 px-4">
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <div className="flex-grow space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                    <div className="flex items-center gap-4 py-4 px-4">
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <div className="flex-grow space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}


export function BillingCard() {
    const [loading, setLoading] = useState(true);
    const [plan, setPlan] = useState("Neup.Pro");
    const [nextCharge, setNextCharge] = useState("$29.00 on Nov 1, 2024");
    
    useEffect(() => {
        // Mock fetching data
        const timer = setTimeout(() => {
            setLoading(false);
        }, 1000);
        return () => clearTimeout(timer);
    }, [])

    const billingItems = [
        { href: '/payment', icon: Wallet, title: 'Manage Subscription', description: `Your next charge is ${nextCharge}.` },
        { href: 'https://neupgroup.com/wallet/history?source=neup', icon: Gem, title: 'Upgrade Plan', description: 'Unlock premium features by upgrading your plan.', isExternal: true },
    ]
    
    if(loading) {
        return <BillingCardSkeleton />;
    }

    return (
         <div className="space-y-2">
            <TitleSet level={1}
                title="Billing & Subscription"
                subtitle={`Your current plan is ${plan}.`}
            />
            <Card>
                <CardContent className="divide-y p-2">
                     {billingItems.map((item) => (
                        <ListItem 
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            title={item.title}
                            description={item.description}
                            isExternal={item.isExternal}
                        />
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
