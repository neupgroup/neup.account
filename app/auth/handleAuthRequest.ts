'use client';

import { initializeAuthFlow } from '@/services/auth/AuthenticationFlow';

export type AuthFlowType = 'signup' | 'signin' | 'forgot_password';

type HandleAuthRequestOptions = {
  flowType: AuthFlowType;
  storageKey?: string;
  clearSessionKeys?: string[];
  forceNew?: boolean;
};

type HandleAuthRequestResult = {
  requestId: string;
  previousId: string | null;
  rotated: boolean;
};

export async function handleAuthRequest(options: HandleAuthRequestOptions): Promise<HandleAuthRequestResult> {
  const { flowType, storageKey = 'AuthSessionRequest', clearSessionKeys = [], forceNew = false } = options;

  const previousId = forceNew ? null : sessionStorage.getItem(storageKey);
  const requestId = await initializeAuthFlow(previousId, flowType);
  const rotated = previousId !== requestId;

  if (forceNew || rotated) {
    for (const key of clearSessionKeys) {
      sessionStorage.removeItem(key);
    }
  }

  sessionStorage.setItem(storageKey, requestId);
  return { requestId, previousId, rotated };
}
