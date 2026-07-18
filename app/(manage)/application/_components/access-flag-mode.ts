/*
::neup.documentation::application-access-flag-mode
::title Application Access Flag Mode Helpers

Maps the role and permission access flags to the single mode selector used in the management UI.

::public

The helpers keep the form vocabulary aligned with the role and permission semantics without leaking the legacy storage columns into the UI.

::public end

::end
*/

export const ACCESS_FLAG_MODE_OPTIONS = [
  {
    value: 'assignable.byTeam',
    label: 'assignable.byTeam',
    description: 'Can be assigned to members with account access.',
  },
  {
    value: 'assignable.toSelf.publicly',
    label: 'assignable.toSelf.publicly',
    description: 'Can be enrolled publicly by any account.',
  },
  {
    value: 'assignable.byRoot',
    label: 'assignable.byRoot',
    description: 'Can only be assigned by another root user.',
  },
  {
    value: 'assignable.toSelf.publicly.byRequest',
    label: 'assignable.toSelf.publicly.byRequest',
    description: 'Can be requested by anyone and approved by an admin.',
  },
  {
    value: 'assignable.byTeam.fromRequest',
    label: 'assignable.byTeam.fromRequest',
    description: 'Can be requested by an account-access holder and sent to the owner.',
  },
] as const;

export type AccessFlagMode = (typeof ACCESS_FLAG_MODE_OPTIONS)[number]['value'];

type AccessFlagInput = {
  assignable?: boolean;
  publiclyEnrollable?: boolean;
  rootAssigned?: boolean;
  publiclyRequestable?: boolean;
  requestableToOwner?: boolean;
};

export function getAccessFlagMode(value: AccessFlagInput): AccessFlagMode {
  if (value.assignable) return 'assignable.byTeam';
  if (value.requestableToOwner) return 'assignable.byTeam.fromRequest';
  if (value.rootAssigned) return 'assignable.byRoot';
  if (value.publiclyRequestable) return 'assignable.toSelf.publicly.byRequest';
  if (value.publiclyEnrollable) return 'assignable.toSelf.publicly';
  return 'assignable.byTeam';
}

export function getAccessFlagPayload(mode: AccessFlagMode) {
  return {
    assignable: mode === 'assignable.byTeam',
    publiclyEnrollable: mode === 'assignable.toSelf.publicly',
    rootAssigned: mode === 'assignable.byRoot',
    publiclyRequestable: mode === 'assignable.toSelf.publicly.byRequest',
    requestableToOwner: mode === 'assignable.byTeam.fromRequest',
  };
}

export function getEnabledAccessFlagLabels(value: AccessFlagInput): string[] {
  const mode = getAccessFlagMode(value);

  return ACCESS_FLAG_MODE_OPTIONS
    .filter((option) => option.value === mode)
    .map((option) => option.label);
}
