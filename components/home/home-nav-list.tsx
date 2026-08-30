
"use client";

import Link from "next/link";
import React from "react";
import {Card, CardContent} from "#/components/ui/card";
import {UserCircle, Key, type LucideIcon, Home, FolderGit2, Database, Combine, HeartHandshake, Gem, Users, LogOut, ArrowLeft, AppWindow, AlertTriangle, Wallet, ShieldCheck, Clock, ChevronRight} from "@/components/icons";
import { NotificationBell } from "../warning-display";
import { ListItem } from '@/components/ui/ListItem'; // Re-using the refactored ListItem


export function HomeNavList({ items }: { items: { href: string; label: string; description: string; icon: LucideIcon }[]}) {
    const excludedHrefs = ['/manage/home'];
    const visibleItems = items.filter(item => !excludedHrefs.includes(item.href));

     if (visibleItems.length === 0) {
        return (
            <Card>
                <CardContent className="p-4 text-left">
                    <p className="text-sm text-muted-foreground">You do not have permission to view any settings in this section.</p>
                </CardContent>
            </Card>
        )
    }

    return (
         <div className="space-y-2">
            <Card>
                <CardContent className="divide-y p-0">
                    {visibleItems.map((item, index) => (
                        <ListItem 
                            key={index}
                            href={item.href}
                            title={item.label}
                            description={item.description}
                            icon={item.icon}
                        />
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}
