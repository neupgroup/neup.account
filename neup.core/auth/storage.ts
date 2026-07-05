// Client-side sessionStorage helpers for caching auth data between page loads.
// Avoids redundant server calls by storing a lightweight profile snapshot and
// the current permissions JSON. Both are invalidated on signout or session change.

export const PROFILE_INFO_KEY = 'profile';
export const JWT_KEY = 'jwt';

// Lightweight profile snapshot stored in sessionStorage.
export type StoredProfileInfo = {
    firstName?: string;
    lastName?: string;
    neupId?: string;
    accountType?: string;
};

// Maps each storage key to its expected value type for type-safe access.
type SessionDataMap = {
    [PROFILE_INFO_KEY]: StoredProfileInfo;
    [JWT_KEY]: string;
};

// Reads a value from sessionStorage by key.
// JWT is stored as a raw string; all other keys are JSON-parsed.
// Returns null on server, missing key, or parse failure.
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

// Writes a value to sessionStorage by key.
// JWT is stored as a raw string; all other keys are JSON-stringified.
export function setSessionData<K extends keyof SessionDataMap>(key: K, value: SessionDataMap[K]) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(key, key === JWT_KEY ? value as string : JSON.stringify(value));
}

// Removes a specific key from sessionStorage, or clears all auth keys if no key is passed.
export function deleteSessionData(key?: keyof SessionDataMap) {
    if (typeof window === 'undefined') return;
    if (key) {
        sessionStorage.removeItem(key);
    } else {
        sessionStorage.removeItem(PROFILE_INFO_KEY);
        sessionStorage.removeItem(JWT_KEY);
    }
}
