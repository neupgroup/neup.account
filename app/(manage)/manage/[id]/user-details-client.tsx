'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@neup/components/ui/tabs";
import { UserDetails } from '@/services/manage/users';
import { ProfileForm } from './profile-form';
import { VerificationManager } from './verification-manager';
import { ActivityList } from './activity/activity-list'; 
import { BackButton } from '@neup/components/element/backButton';

interface UserDetailsClientProps {
    initialUserDetails: UserDetails;
}

export function UserDetailsClient({ initialUserDetails }: UserDetailsClientProps) {
    const [userDetails, setUserDetails] = useState(initialUserDetails);
    return (
        <div className="container mx-auto p-4">
            <div className="flex items-center mb-4">
                <BackButton backsTo="/manage" />
                <h1 className="font-bold ml-2 text-2xl leading-8">{userDetails.profile.nameFirst || ''} {userDetails.profile.nameLast || ''}</h1>
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
