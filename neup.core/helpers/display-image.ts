const DISPLAY_IMAGE_FALLBACK = {
  male: 'https://cdn.neupgroup.com/neupaccount/assets/displayImage/_plain_male.svg',
  female: 'https://cdn.neupgroup.com/neupaccount/assets/displayImage/_plain_female.svg',
  custom: 'https://cdn.neupgroup.com/neupaccount/assets/displayImage/_plain_custom.svg',
  guest: 'https://cdn.neupgroup.com/neupaccount/assets/displayImage/_plain_guest.svg',
} as const;

type DisplayImageInput = {
  displayImage?: string | null;
  accountType?: string | null;
  gender?: string | null;
  isLoggedIn?: boolean;
};

function normalizeGender(value?: string | null): 'male' | 'female' | 'custom' {
  const gender = (value ?? '').trim().toLowerCase();
  if (gender === 'male') return 'male';
  if (gender === 'female') return 'female';
  return 'custom';
}

export function resolveDisplayImage(input: DisplayImageInput): string {
  const image = input.displayImage?.trim();
  if (image) return image;

  const accountType = (input.accountType ?? '').trim().toLowerCase();
  if (input.isLoggedIn === false || accountType === 'guest') {
    return DISPLAY_IMAGE_FALLBACK.guest;
  }

  if (accountType === 'brand' || accountType === 'subbrand') {
    return DISPLAY_IMAGE_FALLBACK.custom;
  }

  const gender = normalizeGender(input.gender);
  if (gender === 'male') return DISPLAY_IMAGE_FALLBACK.male;
  if (gender === 'female') return DISPLAY_IMAGE_FALLBACK.female;
  return DISPLAY_IMAGE_FALLBACK.custom;
}

export function extractGenderFromDetails(input: {
  accountDetails?: unknown;
  individualDetails?: unknown;
}): string | null {
  const accountDetails =
    input.accountDetails && typeof input.accountDetails === 'object'
      ? (input.accountDetails as Record<string, unknown>)
      : {};
  const individualDetails =
    input.individualDetails && typeof input.individualDetails === 'object'
      ? (input.individualDetails as Record<string, unknown>)
      : {};

  const fromAccount = accountDetails.gender;
  if (typeof fromAccount === 'string' && fromAccount.trim()) return fromAccount.trim();

  const fromIndividual = individualDetails.gender;
  if (typeof fromIndividual === 'string' && fromIndividual.trim()) return fromIndividual.trim();

  return null;
}
