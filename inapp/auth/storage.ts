/**
 * ::neup.documentation::inapp-auth-storage
 * ::title In-App Auth Storage
 *
 * Browser sessionStorage helpers for account-auth session cache state.
 *
 * ::public
 *
 * This module stores the lightweight signed-in profile snapshot and the serialized permission list used by the in-app auth session context.
 *
 * ::public end
 *
 * ::private
 *
 * The storage keys and payload shape are account-app specific, so they must not live in `core`.
 *
 * ::private end
 *
 * ::end
 */

export const PROFILE_INFO_KEY = 'profile';
export const JWT_KEY = 'jwt';

export type StoredProfileInfo = {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    nameFirst?: string;
    nameMiddle?: string;
    nameLast?: string;
    nameDisplay?: string;
    displayName?: string;
    neupId?: string;
    neupIdPrimary?: string;
    accountType?: string;
    accountPhoto?: string;
    gender?: string;
    verified?: boolean;
};

type SessionDataMap = {
    [PROFILE_INFO_KEY]: StoredProfileInfo;
    [JWT_KEY]: string;
};

export function getSessionData<K extends keyof SessionDataMap>(key: K): SessionDataMap[K] | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;

        return key === JWT_KEY ? raw as SessionDataMap[K] : JSON.parse(raw);
    } catch {
        return null;
    }
}

export function setSessionData<K extends keyof SessionDataMap>(key: K, value: SessionDataMap[K]) {
    if (typeof window === 'undefined') return;

    sessionStorage.setItem(key, key === JWT_KEY ? value as string : JSON.stringify(value));
}

export function deleteSessionData(key?: keyof SessionDataMap) {
    if (typeof window === 'undefined') return;

    if (key) {
        sessionStorage.removeItem(key);
        return;
    }

    sessionStorage.removeItem(PROFILE_INFO_KEY);
    sessionStorage.removeItem(JWT_KEY);
}
