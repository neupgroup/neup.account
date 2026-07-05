"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSelectedProfilePageData, type SelectedProfilePageData } from '@/services/profile';
import type { UserProfile } from '@/services/user';

/**
 * ::neup.documentation::profile-use-selected-profile-page
 * ::title Selected Profile Page Hook
 *
 * Resolves `/profile/*?selectedProfile=[id]` client pages to the selected account.
 *
 * ::public
 *
 * Profile detail pages use this hook to render selected-profile data without switching the active session account.
 *
 * ::public end
 *
 * ::private
 *
 * The hook delegates profile lookup and authorization to `services/profile.ts`; it only maps URL query state into client rendering state.
 *
 * ::private end
 *
 * ::end
 */

type UseSelectedProfilePageInput = {
  requiredPermissions: readonly string[];
  sessionAccountId: string | null;
  sessionPermissions: string[] | null;
  sessionProfile?: UserProfile | null;
};

export function useSelectedProfilePage({
  requiredPermissions,
  sessionAccountId,
  sessionPermissions,
  sessionProfile,
}: UseSelectedProfilePageInput) {
  const searchParams = useSearchParams();
  const selectedProfile = searchParams.get('selectedProfile');
  const workingProfile = searchParams.get('workingProfile');
  const mode = searchParams.get('mode');
  const [selectedData, setSelectedData] = useState<SelectedProfilePageData | null>(null);
  const [loadingSelectedProfile, setLoadingSelectedProfile] = useState(false);
  const [selectedProfileDenied, setSelectedProfileDenied] = useState(false);

  const profileContextQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedProfile) params.set('selectedProfile', selectedProfile);
    if (mode) params.set('mode', mode);
    if (workingProfile) params.set('workingProfile', workingProfile);
    const query = params.toString();
    return query ? `?${query}` : '';
  }, [mode, selectedProfile, workingProfile]);

  const refreshSelectedProfile = useCallback(async () => {
    if (!selectedProfile) {
      setSelectedData(null);
      setSelectedProfileDenied(false);
      setLoadingSelectedProfile(false);
      return;
    }

    setLoadingSelectedProfile(true);
    const data = await getSelectedProfilePageData({
      selectedProfile,
      workingProfile,
      requiredPermissions,
    });
    setSelectedData(data);
    setSelectedProfileDenied(!data);
    setLoadingSelectedProfile(false);
  }, [requiredPermissions, selectedProfile, workingProfile]);

  useEffect(() => {
    void refreshSelectedProfile();
  }, [refreshSelectedProfile]);

  return {
    selectedProfile,
    selectedProfileDenied,
    loadingSelectedProfile,
    targetAccountId: selectedData?.accountId ?? sessionAccountId,
    targetPermissions: selectedData?.permissions ?? sessionPermissions,
    targetProfile: selectedData?.profile ?? sessionProfile ?? null,
    profileContextQuery,
    profileBackHref: `/profile${profileContextQuery}`,
    refreshSelectedProfile,
  };
}
