import { AsyncLocalStorage } from 'node:async_hooks';

const requestAuthStorage = new AsyncLocalStorage<string | null>();

/** Runs request-bound server work with the already-resolved auth token. */
export function runWithAuthToken<T>(token: string | null, callback: () => T): T {
  return requestAuthStorage.run(token, callback);
}

/** Returns the auth token attached to the current asynchronous request context. */
export function getContextAuthToken(): string | null {
  return requestAuthStorage.getStore() ?? null;
}
