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
    value: 'assignable',
    label: 'assignable',
    description: 'Can be assigned to members with account access.',
  },
  {
    value: 'publiclyEnrollable',
    label: 'publiclyEnrollable',
    description: 'Can be enrolled publicly by any account.',
  },
  {
    value: 'rootAssigned',
    label: 'rootAssigned',
    description: 'Can only be assigned by another root user.',
  },
  {
    value: 'publiclyRequestable',
    label: 'publiclyRequestable',
    description: 'Can be requested by anyone and approved by an admin.',
  },
  {
    value: 'requestableToOwner',
    label: 'requestableToOwner',
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
  if (value.assignable) return 'assignable';
  if (value.requestableToOwner) return 'requestableToOwner';
  if (value.rootAssigned) return 'rootAssigned';
  if (value.publiclyRequestable) return 'publiclyRequestable';
  if (value.publiclyEnrollable) return 'publiclyEnrollable';
  return 'assignable';
}

export function getAccessFlagPayload(mode: AccessFlagMode) {
  return {
    assignable: mode === 'assignable',
    publiclyEnrollable: mode === 'publiclyEnrollable',
    rootAssigned: mode === 'rootAssigned',
    publiclyRequestable: mode === 'publiclyRequestable',
    requestableToOwner: mode === 'requestableToOwner',
  };
}

export function getEnabledAccessFlagLabels(value: AccessFlagInput): string[] {
  return ACCESS_FLAG_MODE_OPTIONS
    .filter((option) => value[option.value] === true)
    .map((option) => option.label);
}
