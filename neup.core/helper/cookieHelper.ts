'use server';

import { cookies } from 'next/headers';

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export type CookieOptions = Parameters<CookieStore['set']>[2];

export async function getCookies(): Promise<Record<string, string>> {
  const store = await cookies();
  const result: Record<string, string> = {};

  store.getAll().forEach(({ name, value }) => {
    result[name] = value;
  });

  return result;
}

export async function getCookie(name: string): Promise<string | undefined> {
  const store = await cookies();
  return store.get(name)?.value;
}

export async function setCookies(
  name: string,
  value: string,
  options?: CookieOptions,
): Promise<void> {
  const store = await cookies();

  if (options) {
    store.set(name, value, options);
    return;
  }

  store.set(name, value);
}
