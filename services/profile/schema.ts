import { z } from 'zod';

/**
 * Schema profileFormSchema.
 */
export const profileFormSchema = z.object({
  nameFirst: z.string().min(1, 'First name is required'),
  nameMiddle: z.string().optional(),
  nameLast: z.string().min(1, 'Last name is required'),
  nameDisplay: z.string().optional(),
  accountPhoto: z.string().url().optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'custom', 'prefer_not_to_say']),
  customGender: z.string().optional(),
  dateBirth: z.date().optional(),
  primaryPhone: z.string().optional(),
  secondaryPhone: z.string().optional(),
  permanentLocation: z.string().optional(),
  currentLocation: z.string().optional(),
  newNeupIdRequest: z.string().optional(),
});


/**
 * Schema brandProfileFormSchema.
 */
export const brandProfileFormSchema = z.object({
  nameDisplay: z.string().min(1, 'Display name is required'),
  accountPhoto: z.string().url().optional().or(z.literal('')),
  isLegalEntity: z.boolean(),
  nameLegal: z.string().optional(),
  registrationId: z.string().optional(),
  countryOfOrigin: z.string().optional(),
  dateEstablished: z.date().optional(),
});

export const brandLegalFormSchema = z.object({
  isLegalEntity: z.boolean(),
  nameLegal: z.string().optional(),
  dateEstablished: z.date().optional(),
  headOfficeLocation: z.string().optional(),
});
