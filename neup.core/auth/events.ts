// Browser auth lifecycle events used to refresh session-bound UI state
// (profile, permissions, sidebar configuration) without requiring a hard reload.

export const AUTH_STATE_CHANGED_EVENT = 'neup:auth-state-changed';

export function announceAuthStateChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
}
