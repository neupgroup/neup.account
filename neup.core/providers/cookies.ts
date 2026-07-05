// Singleton cookie provider for server-side cookie operations.
// Use setCookie() for standard auth cookies (secure, httpOnly, domain-wide).
// Use setCookieRaw() when you need full control over cookie attributes.

import { cookies } from 'next/headers';
import { Singleton } from '@/neup.core/interface/singleton';

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type SameSite = 'strict' | 'lax' | 'none';

// Full set of options available when setting a cookie via setCookieRaw().
export type CookieRawOptions = {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: SameSite;
    path?: string;
    domain?: string;
    expires?: Date;
    maxAge?: number;
    partitioned?: boolean;
    priority?: 'low' | 'medium' | 'high';
};

class CookieProvider extends Singleton {
    public constructor() {
        super();
    }

    public static getInstance(): CookieProvider {
        return this.instanceFor<CookieProvider>();
    }

    // Resolves the Next.js cookie store for the current request.
    private async store(): Promise<CookieStore> {
        return cookies();
    }

    // Returns all cookies as a plain key-value record.
    async getCookies(): Promise<Record<string, string>> {
        const store = await this.store();
        const result: Record<string, string> = {};
        store.getAll().forEach(({ name, value }) => {
            result[name] = value;
        });
        return result;
    }

    // Returns the value of a single cookie by name, or undefined if not set.
    async getCookie(name: string): Promise<string | undefined> {
        const store = await this.store();
        return store.get(name)?.value;
    }

    // Sets a cookie with secure defaults: httpOnly, secure, sameSite lax, domain-wide.
    // The domain is read from the COOKIE_DOMAIN env var, defaulting to .neupgroup.com.
    async setCookie(name: string, value: string, expiresOn: Date): Promise<void> {
        const store = await this.store();
        store.set(name, value, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            domain: process.env.COOKIE_DOMAIN || '.neupgroup.com',
            expires: expiresOn,
        });
    }

    // Sets a cookie with full control over all attributes.
    // Defaults to httpOnly: true, secure: true, sameSite: lax if not specified.
    async setCookieRaw(name: string, value: string, options: CookieRawOptions = {}): Promise<void> {
        const store = await this.store();
        store.set(name, value, {
            httpOnly: options.httpOnly ?? true,
            secure: options.secure ?? true,
            sameSite: options.sameSite ?? 'lax',
            path: options.path ?? '/',
            domain: options.domain,
            expires: options.expires,
            maxAge: options.maxAge,
            partitioned: options.partitioned,
            priority: options.priority,
        });
    }

    // Deletes a cookie by name.
    async deleteCookie(name: string): Promise<void> {
        const store = await this.store();
        store.delete(name);
    }
}

export const cookieProvider = CookieProvider.getInstance();
