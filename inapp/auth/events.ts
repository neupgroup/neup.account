/*
::neup.documentation::inapp-auth-events
::title In-App Auth Events

Browser event names used to notify client auth consumers that session state changed.

::public

Dispatch `AUTH_STATE_CHANGED_EVENT` after sign-in, sign-out, or account switching so auth-aware UI can clear stale cache and refetch session state.

::public end

::end
*/

export const AUTH_STATE_CHANGED_EVENT = 'neup:auth-state-changed';

export function announceAuthStateChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
}
