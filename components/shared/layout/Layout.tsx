import React from 'react';
import { HeaderV1 } from '@/components/layout/header.v1';
import { Sidebar } from '../sidebar';
import { Body } from '../body';
import { getSiteLogoUrl } from '@/services/manage/site/logo';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout = async ({ children }: LayoutProps) => {
    const logoUrl = await getSiteLogoUrl();

    return (
        <div className="min-h-screen bg-white flex flex-col">
            <HeaderV1 logoUrl={logoUrl} />
            <div className="pt-16">
                <div className="w-full bg-white"> {/* Full body background */}
                    <div className="max-w-[1440px] mx-auto flex items-start">
                        <Sidebar />
                        <Body>
                            {children}
                        </Body>
                    </div>
                </div>
            </div>
        </div>
    );
};
