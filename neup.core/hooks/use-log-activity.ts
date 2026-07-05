"use client";

import {useContext} from 'react';
import {Geolocation} from '@/neup.core/providers/geolocation';
import {logActivity} from '@/services/log-actions';


// Client-side hook to wrap logActivity and inject geolocation
export function useLogActivity() {
    const geo = useContext(Geolocation);

    return (
        memberId: string,
        action: string,
        status: "Success" | "Failed" | "Pending" | "Alert",
        ipAddress?: string,
        actorAccountId?: string
    ) => {
        const locationString = geo?.latitude && geo?.longitude
            ? `${geo.latitude},${geo.longitude}`
            : undefined;

        return logActivity(memberId, action, status, ipAddress, actorAccountId, locationString);
    };
}
