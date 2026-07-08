'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserDetails } from '@/services/manage/users';
import { ProfileForm } from './profile-form';
import { VerificationManager } from './verification-manager';
import { ActivityList } from './activity/activity-list'; 
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/icons';
import { useRouter } from 'next/navigation';
import { redirectInApp } from '@/core/helper/navigation';

interface UserDetailsClientProps {
    initialUserDetails: UserDetails;
}

export function UserDetailsClient({ initialUserDetails }: UserDetailsClientProps) {
    const [userDetails, setUserDetails] = useState(initialUserDetails);
    const router = useRouter();

    const handleBack = () => {
        redirectInApp(router, '/manage');
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex items-center mb-4">
                <Button variant="ghost" size="icon" onClick={handleBack}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <h1 className="text-2xl font-bold ml-2">{userDetails.profile.nameFirst || ''} {userDetails.profile.nameLast || ''}</h1>
            </div>

            <Tabs defaultValue="profile">
                <TabsList>
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="verification">Verification</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="permissions">Permissions</TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                    <ProfileForm 
                        profile={userDetails.profile} 
                        accountId={userDetails.accountId} 
                    />
                </TabsContent>
                <TabsContent value="verification">
                    <VerificationManager accountId={userDetails.accountId} />
                </TabsContent>
                <TabsContent value="activity">
                    <ActivityList accountId={userDetails.accountId} />
                </TabsContent>
                <TabsContent value="permissions">
                    <p>Permissions management coming soon.</p>
                </TabsContent>
            </Tabs>
        </div>
    );
}
