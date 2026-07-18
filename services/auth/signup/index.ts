
'use server';

import prisma from '@/core/database/prisma';
import bcrypt from 'bcryptjs';
import { logActivity } from '@/services/log-actions';
import { logError } from '@/logica/logger/files';
import type { z } from 'zod';
import { getAuthRequest, extendAuthRequest } from '../auth-request';
import { getAuthTimeoutError } from '../timeout';
import { verifyPassword } from '../password';
import { makeSessionFromRequest } from '@/services/account/makeSession';
import { assignDefaultRole } from '../assignDefaultRole';
import {
  nameSchema,
  demographicsSchema,
  nationalitySchema,
  contactSchema,
  otpSchema,
  neupidSchema,
  passwordSchema,
  termsSchema,
} from '@/services/auth/signup/schema';

// Helper to sanitize name fields
const sanitizeName = (name: string | undefined | null): string => {
  if (!name) return '';
  return name.trim().replace(/\s+/g, ' ');
};

/**
 * Type SignupRequestData.
 */
type SignupRequestData = {
  nameFirst?: string;
  nameLast?: string;
  nameMiddle?: string;
  dateBirth?: string | Date;
  gender?: string;
  customGender?: string | null;
  nationality?: string;
  phone?: string;
  phoneVerified?: boolean;
  neupId?: string;
  password?: string;
  accountId?: string;
  isPendingDeletion?: boolean;
};


/**
 * Function getSignupStepData.
 */
export async function getSignupStepData(authRequestId: string) {
  if (!authRequestId) {
    return { success: false, data: null };
  }
  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request) {
    return { success: false, data: null };
  }
  return { success: true, data: request.data.data as SignupRequestData };
}


/**
 * Function submitNameStep.
 */
export async function submitNameStep(authRequestId: string, data: z.infer<typeof nameSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = nameSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  const nameFirst = sanitizeName(validation.data.firstName);
  const nameMiddle = sanitizeName(validation.data.middleName);
  const nameLast = sanitizeName(validation.data.lastName);

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    nameFirst,
    nameMiddle,
    nameLast
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_demographics',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitDemographicsStep.
 */
export async function submitDemographicsStep(authRequestId: string, data: z.infer<typeof demographicsSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = demographicsSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  let finalGender = validation.data.gender;
  let finalCustomGender = validation.data.customGender;

  if (finalGender === 'custom' && (!finalCustomGender || finalCustomGender.trim() === '')) {
    finalGender = 'prefer_not_to_say';
    finalCustomGender = undefined;
  }

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    dateBirth: validation.data.dob instanceof Date 
        ? validation.data.dob.toISOString().split('T')[0] // Store as YYYY-MM-DD string
        : validation.data.dob,
    gender: finalGender,
    customGender: finalCustomGender ? sanitizeName(finalCustomGender) : null,
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_nationality',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitNationalityStep.
 */
export async function submitNationalityStep(authRequestId: string, data: z.infer<typeof nationalitySchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = nationalitySchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    nationality: validation.data.nationality,
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_contact',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitContactStep.
 */
export async function submitContactStep(authRequestId: string, data: z.infer<typeof contactSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = contactSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  // OTP verification skipped — phone is marked as verified directly.

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    phone: validation.data.phone,
    phoneVerified: true,
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_neupid',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitOtpStep.
 */
export async function submitOtpStep(authRequestId: string, data: z.infer<typeof otpSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = otpSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  // TODO: Verify OTP logic here
  if (validation.data.code !== '123456') {
    return { success: false, error: 'Invalid OTP code.' };
  }

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    phoneVerified: true,
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_neupid',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitNeupIdStep.
 */
export async function submitNeupIdStep(authRequestId: string, data: z.infer<typeof neupidSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = neupidSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const neupId = validation.data.neupId.toLowerCase();
  const existingNeupId = await prisma.neupId.findUnique({
    where: { id: neupId },
  });

  if (existingNeupId) {
    return { success: false, error: 'This NeupID is already taken.' };
  }

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    neupId: neupId,
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_password',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitPasswordStep.
 */
export async function submitPasswordStep(authRequestId: string, data: z.infer<typeof passwordSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = passwordSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'Invalid data.',
      details: validation.error.flatten(),
    };

  const passwordCheck = await verifyPassword({
    password: validation.data.password,
    minLength: 8,
  });

  if (passwordCheck.status !== 'valid') {
    return { success: false, error: 'Invalid password.' };
  }

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  const hashedPassword = await bcrypt.hash(validation.data.password, 10);

  const currentData = request.data.data as SignupRequestData;
  const newData = {
    ...currentData,
    password: hashedPassword,
  };

  await prisma.authnRequest.update({
    where: { id: authRequestId },
    data: {
      data: newData,
      status: 'pending_terms',
    },
  });
  await extendAuthRequest(authRequestId);

  return { success: true };
}


/**
 * Function submitTermsStep.
 */
export async function submitTermsStep(authRequestId: string, data: z.infer<typeof termsSchema>) {
  if (!authRequestId)
    return { success: false, error: 'Signup session not found.' };

  const validation = termsSchema.safeParse(data);
  if (!validation.success)
    return {
      success: false,
      error: 'You must agree to the terms.',
      details: validation.error.flatten(),
    };

  const request = await getAuthRequest(authRequestId, { expectedType: 'signup' });
  if (!request)
    return { success: false, error: getAuthTimeoutError('signup') };

  const requestData = request.data.data as SignupRequestData;

  if (!requestData || Object.keys(requestData).length === 0) {
      return { success: false, error: 'Session data lost. Please restart signup.' };
  }

  const {
    nameFirst,
    nameLast,
    nameMiddle,
    dateBirth,
    gender,
    nationality,
    phone,
    neupId,
    password,
  } = requestData;

  // Validate dateBirth specifically
  let birthDateObj: Date;
  if (typeof dateBirth === 'string' && !dateBirth.includes('T')) {
      // It's a YYYY-MM-DD string
      birthDateObj = new Date(dateBirth + 'T00:00:00');
    } else if (dateBirth instanceof Date) {
      birthDateObj = new Date(dateBirth);
  } else {
      return { success: false, error: 'Invalid date of birth in session data.' };
  }

  if (isNaN(birthDateObj.getTime())) {
      return { success: false, error: 'Invalid date of birth in session data.' };
  }

  const nameDisplay = [nameFirst, nameMiddle, nameLast].filter(Boolean).join(' ');

  if (
    !nameFirst ||
    !nameLast ||
    !dateBirth ||
    !gender ||
    !nationality ||
    !phone ||
    !neupId ||
    !password
  ) {
    return {
      success: false,
      error: 'Incomplete signup data. Please start over.',
    };
  }

  try {
    const neupIdTaken = await prisma.neupId.findUnique({
        where: { id: neupId },
    });
    if (neupIdTaken) {
         return { success: false, error: 'This NeupID is no longer available.' };
    }

    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: {
          accountType: 'individual',
          status: 'active',
          isVerified: false,
          displayName: nameDisplay,
          displayImage: null,

          neupIds: {
            create: {
              id: neupId,
              neupId,
              isPrimary: true,
            },
          },

          contacts: {
            create: {
              contactType: 'primaryPhone',
              value: phone,
            },
          },

          individualProfile: {
            create: {
              firstName: nameFirst,
              middleName: nameMiddle || null,
              lastName: nameLast,
              dateOfBirth: birthDateObj,
              countryOfResidence: nationality,
            },
          },
          authMethods: {
            create: {
              type: 'password',
              value: password,
              order: 'primary',
              status: 'active',
            },
          },
        },
      });

      return created;
    });

    const accountId = account.id;

    // Assign the default role so the account has baseline permissions immediately
    await assignDefaultRole(accountId);

    await logActivity(
      accountId,
      'User Registration',
      'Success'
    );

    const sessionResult = await makeSessionFromRequest({
      accountId,
      loginType: 'Registration',
    });

    if (!sessionResult.success) {
      return { success: false, error: sessionResult.error || 'Failed to create session.' };
    }

    // Mark the auth request as completed
    await prisma.authnRequest.update({
        where: { id: authRequestId },
        data: { status: 'completed' }
    });

    return { success: true };
  } catch (error) {
    await logError('database', error, 'submitTermsStep');
    return {
      success: false,
      error: 'An unexpected error occurred during registration.',
    };
  }
}
