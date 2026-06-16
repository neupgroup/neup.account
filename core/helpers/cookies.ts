

import { cookies } from 'next/headers';
import type { StoredAccount } from '@/core/auth/session';
import type { Session } from "@/core/auth/session";
import { Singleton } from '@/core/interface/singleton';

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type CookieSetOptions = Parameters<CookieStore['set']>[2];


/**
 * Base options for all authentication-related cookies.
 * Sets path, SameSite, Secure, and HttpOnly attributes.
 * Secure and HttpOnly flags are set to true unconditionally for ALL environments (Dev & Prod).
 */
const COOKIE_OPTIONS = {
    path: '/',
    sameSite: 'lax' as const,
    secure: true,
    httpOnly: true,
};


/**
 * Options for cookies that should persist for a long time.
 * Simply extends the base COOKIE_OPTIONS with a 1-year expiration.
 */
const LONG_LIVED_COOKIE_OPTIONS = {
    ...COOKIE_OPTIONS,
    expires: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
};


export class AuthCookiesHelper extends Singleton {
    public constructor() {
        super();
    }

    public static getInstance(): AuthCookiesHelper {
        return this.instanceFor<AuthCookiesHelper>();
    }

    private async getStore() {
        return cookies();
    }

    public async get(name: string) {
        const cookieStore = await this.getStore();
        return cookieStore.get(name)?.value;
    }

    public async set(name: string, value: string, options?: CookieSetOptions) {
        const cookieStore = await this.getStore();
        if (options) {
            cookieStore.set(name, value, options);
            return;
        }

        cookieStore.set(name, value);
    }

    public async del(name: string) {
        const cookieStore = await this.getStore();
        cookieStore.delete(name);
    }

    public async getJson<T>(name: string, fallback: T): Promise<T> {
        const raw = await this.get(name);
        if (!raw) {
            return fallback;
        }

        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    }

    public async setJson(name: string, value: unknown, options?: CookieSetOptions) {
        await this.set(name, JSON.stringify(value), options);
    }

    public async getSessionCookies() {
        const raw = await this.get('auth_account');
        let account: StoredAccount | null = null;

        if (raw) {
            try {
                const { verifyAccountToken } = await import('@/core/auth/accountToken');
                const payload = await verifyAccountToken(raw.trim());
                if (payload) {
                    account = {
                        aid: payload.aid,
                        sid: payload.sid,
                        skey: payload.skey,
                        def: 1,
                        nid: payload.nid ?? '',
                        neupId: payload.nid ?? '',
                        guest: payload.guest,
                    } as StoredAccount;
                }
            } catch {
                // Malformed token — treat as no account
            }
        }

        const aid = account?.aid || '';
        const sid = account?.sid || '';
        const skey = account?.skey || '';
        const allAccounts: StoredAccount[] = account ? [account] : [];

        return {
            aid,
            sid,
            skey,
            jwt: undefined as string | undefined,
            accountId: aid,
            sessionId: sid,
            sessionKey: skey,
            allAccounts,
        };
    }

    public async setSessionCookies(session: Session, expires: Date) {
        const aid = session.aid || session.accountId;
        const sid = session.sid || session.sessionId;
        const skey = session.skey || session.sessionKey;

        if (!aid || !sid || !skey) {
            throw new Error('Missing session values for cookie set.');
        }

        const { setAccount } = await import('@/core/auth/accounts');
        const existing = await this.getSessionCookies();
        const nid = existing.allAccounts[0]?.nid || '';
        await setAccount(aid, sid, skey, nid);
    }

    public async setStoredAccountsCookie(accounts: StoredAccount[]) {
        // With single-account model, use the first def:1 account (or first account)
        const active = accounts.find(a => a.def === 1) ?? accounts[0];
        if (!active) return;

        const { signAccountToken } = await import('@/core/auth/accountToken');
        const isGuest = !active.nid && !active.neupId;
        const token = await signAccountToken(
          isGuest
            ? { aid: active.aid, sid: active.sid ?? '', skey: active.skey ?? '', guest: 1 }
            : { aid: active.aid, sid: active.sid ?? '', skey: active.skey ?? '', nid: active.nid ?? active.neupId ?? '' }
        );
        const cookieStore = await this.getStore();
        cookieStore.set('auth_account', token, LONG_LIVED_COOKIE_OPTIONS);
    }

    public async clearSessionCookies() {
        // Clear the single auth_account cookie
        const cookieStore = await this.getStore();
        cookieStore.delete('auth_account');

        await this.del('auth_account_switch');

        // Remove legacy individual session cookies
        await this.del('auth_acc');
        await this.del('auth_aid');
        await this.del('auth_sid');
        await this.del('auth_skey');
        await this.del('auth_jwt');
        await this.del('auth_account_id');
        await this.del('auth_session_id');
        await this.del('auth_session_key');
        await this.del('auth_permit');
        await this.del('profile_name');
        await this.del('profile_neupid');
    }
}

// Shared singleton used by all server helpers and services.
export const authCookies = AuthCookiesHelper.getInstance();


/**
 * Retrieves all authentication-related cookies.
 */
export async function getSessionCookies() {
    return authCookies.getSessionCookies();
}


/**
 * Sets the main session cookies.
 */
export async function setSessionCookies(session: Session, expires: Date) {
    return authCookies.setSessionCookies(session, expires);
}


/**
 * Sets the long-lived cookie for storing all known accounts on the device.
 */
export async function setStoredAccountsCookie(accounts: StoredAccount[]) {
    return authCookies.setStoredAccountsCookie(accounts);
}


/**
 * Clears all active session cookies, effectively logging the user out.
 */
export async function clearSessionCookies() {
    return authCookies.clearSessionCookies();
}
