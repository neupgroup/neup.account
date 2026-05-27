'use server';

import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { format, isValid, parse as parseWithFormat } from 'date-fns';
import { brandProfileFormSchema } from '@/services/profile/schema';
import { getUserProfile, checkPermissions, checkNeupIdAvailability, getUserNeupIds } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { getAITextResponse } from '@/services/shared/ai';
import { logDisplayImageResourceForAccount } from '@/services/manage/site/resources';

const DEFAULT_ACCOUNT_AVATAR = 'https://neupgroup.com/assets/user.png';


/**
 * Function getDisplayNameSuggestions.
 */
export async function getDisplayNameSuggestions(accountId: string): Promise<string[]> {
    const profile = await getUserProfile(accountId);
    if (!profile) return [];

    const { nameFirst, nameMiddle, nameLast } = profile;
    const suggestions = new Set<string>();

    if (nameFirst) {
        suggestions.add(nameFirst);
    }
    if (nameFirst && nameMiddle) {
        suggestions.add(`${nameFirst} ${nameMiddle}`);
    }
    if (nameFirst && nameLast) {
        suggestions.add(`${nameFirst} ${nameLast}`);
        suggestions.add(`${nameLast} ${nameFirst}`);
    }
    if (nameFirst && nameMiddle && nameLast) {
        suggestions.add(`${nameFirst} ${nameMiddle} ${nameLast}`);
        suggestions.add(`${nameLast} ${nameMiddle} ${nameFirst}`);
    }
    
    return Array.from(suggestions);
}


/**
 * Function getPastProfilePhotos.
 */
export async function getPastProfilePhotos(accountId: string): Promise<string[]> {
    try {
        const rows = await prisma.resource.findMany({
            where: {
                accountId,
                type: 'display_image',
            },
            orderBy: { uploadedOn: 'desc' },
            select: { value: true },
            take: 20,
        });

        return Array.from(
            new Set(
                rows
                    .map((row) => row.value?.trim())
                    .filter((value): value is string => !!value)
            )
        );
    } catch (error) {
        await logError('database', error, `getPastProfilePhotos for ${accountId}`);
        return [];
    }
}


/**
 * Function updateOrCreateContact.
 */
async function updateOrCreateContact(tx: any, accountId: string, type: string, value: string | undefined, hasPermission: boolean) {
    if (!hasPermission) return;

    const existing = await tx.contact.findFirst({
        where: { accountId, contactType: type }
    });

    if (value && value.trim().length > 0) {
        if (existing) {
            await tx.contact.update({
                where: { id: existing.id },
                data: { value }
            });
        } else {
            await tx.contact.create({
                data: {
                    accountId,
                    contactType: type,
                    value
                }
            });
        }
    } else if (existing) {
        await tx.contact.delete({ where: { id: existing.id } });
    }
}


/**
 * Function updateUserProfile.
 */
export async function updateUserProfile(accountId: string, data: Record<string, any>, geolocation?: string) {
    const actorAccountId = await getPersonalAccountId();
    const [canModifyProfile, canModifyContact, canModifyNeupId] = await Promise.all([
        checkPermissions(['profile.modify']),
        checkPermissions(['contact.modify', 'contact.add', 'contact.remove']),
        checkPermissions(['profile.neupid.add']),
    ]);

    if (!canModifyProfile && !canModifyContact && !canModifyNeupId) {
         return { success: false, error: "You do not have permission to update this profile." }
    }

    if (!accountId) {
        return { success: false, error: "User not authenticated." }
    }

    try {
        await prisma.$transaction(async (tx: any) => {

            if (canModifyProfile) {
                const accountData: Record<string, any> = {};
                const validAccountFields = ['nameFirst', 'nameMiddle', 'nameLast', 'gender', 'customGender', 'dateBirth', 'nameDisplay', 'accountPhoto'];
                for(const key of validAccountFields) {
                    if(data[key] !== undefined) {
                        accountData[key] = data[key];
                    }
                }

                const hasNameChange = ['nameFirst', 'nameMiddle', 'nameLast'].some(key => data[key] !== undefined);
                if (hasNameChange) {
                    const currentProfile = await getUserProfile(accountId);
                    const newFirstName = data.nameFirst ?? currentProfile?.nameFirst;
                    const newMiddleName = data.nameMiddle ?? currentProfile?.nameMiddle;
                    const newLastName = data.nameLast ?? currentProfile?.nameLast;
                    
                    let defaultDisplayName = `${newFirstName || ''} ${newLastName || ''}`.trim();
                    if (newMiddleName) {
                        defaultDisplayName = `${newFirstName || ''} ${newMiddleName} ${newLastName || ''}`.trim();
                    }
                    accountData.nameDisplay = defaultDisplayName;
                }

                if (accountData.dateBirth instanceof Date) {
                  accountData.dateBirth = accountData.dateBirth;
                }
                
                if (data.customDisplayNameRequest) {
                     const requesterId = await getPersonalAccountId();

                     await tx.authnRequest.updateMany({
                        where: { type: 'display_name_request', accountId, status: 'pending' },
                        data: { status: 'cancelled', data: { remarks: 'Superseded by new request.' } as any }
                     });
                     
                     await tx.authnRequest.create({
                        data: {
                            type: 'display_name_request',
                            accountId,
                            status: 'pending',
                            data: { requestedDisplayName: data.customDisplayNameRequest, requestor: requesterId } as any,
                            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        }
                     });
                    await logActivity(accountId, `Requested Custom Display Name: ${data.customDisplayNameRequest}`, 'Pending', undefined, geolocation);
                    delete accountData.nameDisplay;
                }

                if(Object.keys(accountData).length > 0) {
                    if (typeof accountData.accountPhoto === 'string') {
                        accountData.displayImage = accountData.accountPhoto.trim() || null;
                        delete accountData.accountPhoto;
                    }

                    await tx.account.update({
                        where: { id: accountId },
                        data: accountData
                    });

                    if (typeof accountData.displayImage === 'string' && accountData.displayImage.trim().length > 0 && actorAccountId) {
                        await logDisplayImageResourceForAccount({
                            accountId,
                            uploadedBy: actorAccountId,
                            value: accountData.displayImage,
                            type: 'display_image',
                        });
                    }
                }
            }
            
            if (canModifyNeupId && data.newNeupIdRequest && data.newNeupIdRequest.trim().length > 0) {
                const { available } = await checkNeupIdAvailability(data.newNeupIdRequest);
                if (!available) {
                    throw new Error("neupid_taken");
                }
                
                const existingNeupIds = await getUserNeupIds(accountId);
                const isPro = false;
                const limit = isPro ? 2 : 1;

                if (existingNeupIds.length >= limit) {
                    throw new Error(`limit_${limit}`);
                }

                const requestedNeupId = data.newNeupIdRequest.toLowerCase();
                const requesterId = await getPersonalAccountId();

                await tx.authnRequest.create({
                    data: {
                        type: 'neupid_request',
                        accountId,
                        status: 'pending',
                        data: { requestedNeupId, requestor: requesterId } as any,
                        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                    }
                });
                await logActivity(accountId, `Requested New NeupID: ${requestedNeupId}`, 'Pending', undefined, geolocation);
            }

            await updateOrCreateContact(tx, accountId, 'primaryPhone', data.primaryPhone, canModifyContact);
            await updateOrCreateContact(tx, accountId, 'secondaryPhone', data.secondaryPhone, canModifyContact);
            await updateOrCreateContact(tx, accountId, 'permanentLocation', data.permanentLocation, canModifyContact);
            await updateOrCreateContact(tx, accountId, 'currentLocation', data.currentLocation, canModifyContact);
            await updateOrCreateContact(tx, accountId, 'workLocation', data.workLocation, canModifyContact);
            await updateOrCreateContact(tx, accountId, 'otherLocation', data.otherLocation, canModifyContact);
        });
        
        await logActivity(accountId, 'Profile Update', 'Success', undefined, geolocation);
        
        const message = data.customDisplayNameRequest 
            ? "Your display name request has been submitted for review."
            : "Profile updated successfully.";

        return { success: true, message }
    } catch (error) {
        if (error instanceof Error) {
            if (error.message.startsWith('limit_')) {
                const limit = error.message.split('_')[1];
                return { success: false, error: `You have reached the limit of ${limit} NeupID(s) for your account.` };
            }
            if (error.message === 'neupid_taken') {
                return { success: false, error: "The requested NeupID is already taken." };
            }
        }
        await logError('database', error as any, `updateUserProfile: ${accountId}`);
        if (error instanceof z.ZodError) {
            return { success: false, error: "Validation failed.", details: error.flatten() }
        }
        return { success: false, error: "An unexpected error occurred." }
    }
}


/**
 * Function updateBrandProfile.
 */
export async function updateBrandProfile(accountId: string, data: z.infer<typeof brandProfileFormSchema>, locationString?: string) {
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) {
        return { success: false, error: "User not authenticated." };
    }

    const validation = brandProfileFormSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: "Invalid data provided.", details: validation.error.flatten() };
    }

    try {
        const allowed: Record<string, any> = {
            nameDisplay: validation.data.nameDisplay,
            accountPhoto: validation.data.accountPhoto || undefined,
            isLegalEntity: validation.data.isLegalEntity,
            nameLegal: validation.data.nameLegal || undefined,
            registrationId: validation.data.registrationId || undefined,
            countryOfOrigin: validation.data.countryOfOrigin || undefined,
            dateEstablished: validation.data.dateEstablished || undefined,
        };

        await prisma.account.update({
            where: { id: accountId },
            data: allowed
        });
        revalidatePath('/manage/profile');
        
        return { success: true, message: "Brand profile updated successfully." };
    } catch (error) {
        await logError('database', error, 'updateBrandProfile');
        return { success: false, error: 'An unexpected error occurred while updating your profile.' };
    }
}


/**
 * Function parseDateString.
 */
export async function parseDateString(dateString: string): Promise<{ success: boolean; date: string | null; error?: string }> {
    if (dateString.length > 30) {
        return { success: false, date: null, error: "Date input is too long (max 30 characters)." };
    }

    const regex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
    const match = dateString.match(regex);
    if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]);
        const day = parseInt(match[3]);
        
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            // Use UTC to validate the date to avoid server timezone issues
            const d = new Date(Date.UTC(year, month - 1, day));
            if (!isNaN(d.getTime()) && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
                 // Return strictly formatted YYYY-MM-DD string
                 return { 
                     success: true, 
                     date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` 
                 };
            }
        }
    }

    const normalized = dateString.trim().replace(/\s+/g, ' ');
    const acceptedFormats = [
        'yyyy-MM-dd',
        'yyyy/MM/dd',
        'dd-MM-yyyy',
        'dd/MM/yyyy',
        'MM-dd-yyyy',
        'MM/dd/yyyy',
        'd MMM yyyy',
        'd MMMM yyyy',
        'MMM d yyyy',
        'MMMM d yyyy',
        'd-MMM-yyyy',
        'd-MMMM-yyyy',
    ];

    for (const dateFormat of acceptedFormats) {
        const parsed = parseWithFormat(normalized, dateFormat, new Date());
        if (isValid(parsed)) {
            return { success: true, date: format(parsed, 'yyyy-MM-dd') };
        }
    }

    const fallback = new Date(normalized);
    if (!isNaN(fallback.getTime())) {
        return { success: true, date: fallback.toISOString().slice(0, 10) };
    }

    try {
        const aiResult = await getAITextResponse({
            context: { value: normalized },
            query: 'convert to date in YYYY-MM-DD',
        });

        const aiDateMatch = aiResult.match(/\b\d{4}-\d{2}-\d{2}\b/);
        if (aiDateMatch) {
            const aiDate = aiDateMatch[0];
            const parsed = new Date(`${aiDate}T00:00:00Z`);
            if (!isNaN(parsed.getTime())) {
                return { success: true, date: aiDate };
            }
        }
    } catch (error) {
        await logError('ai', error, `parseDateString ai fallback: ${dateString}`);
    }

    return { success: false, date: null, error: "Invalid date format." };
}


// Handles profile reads for all consumers — bridge API, gRPC, and web routes.
// Supports session-based auth (aid/sid/skey headers) and one-time tempToken auth.
export async function bridgeGetProfile(input: {
  searchParams: URLSearchParams;
  headers: Headers;
  body?: any;
}): Promise<{ status: number; body: Record<string, any> }> {
  try {
    const { searchParams, headers, body } = input;

    const headerAid = headers.get('aid');
    const headerSid = headers.get('sid');
    const headerSkey = headers.get('skey');

    const tempToken = searchParams.get('tempToken');
    const appId = searchParams.get('appId');

    let requestedAid = searchParams.get('aid');
    let requestedNeupId = searchParams.get('neupid');

    if (body && typeof body === 'object') {
      requestedAid = body.aid || requestedAid;
      requestedNeupId = body.neupid || requestedNeupId;
    }

    let authenticatedAccountId: string | null = null;
    let isTempTokenAuth = false;

    if (headerAid && headerSid && headerSkey) {
    const appSession = await prisma.authnSession.findUnique({
        where: { id: headerSid },
        select: { accountId: true, key: true, validTill: true },
      });

      if (
        appSession &&
        appSession.accountId === headerAid &&
        appSession.key === headerSkey &&
        appSession.validTill &&
        appSession.validTill > new Date()
      ) {
        authenticatedAccountId = headerAid;
      }
    } else if (tempToken && appId) {
    const request = await prisma.authnRequest.findUnique({
        where: { id: tempToken },
        select: { type: true, status: true, data: true, accountId: true, expiresAt: true },
      });
      const requestData = (request?.data as Record<string, any> | null) || {};
      const requestAppId = typeof requestData.appId === 'string' ? requestData.appId : null;

      if (
        request &&
        request.type === 'bridge_grant' &&
        request.status === 'pending' &&
        request.expiresAt > new Date() &&
        request.accountId &&
        requestAppId === appId
      ) {
        authenticatedAccountId = request.accountId;
        isTempTokenAuth = true;
      }
    }

    if (!authenticatedAccountId) {
      return { status: 401, body: { error: 'unauthorized', error_description: 'Authentication failed' } };
    }

    let memberId: string | null = null;

    if (requestedAid) {
      memberId = requestedAid;
    } else if (requestedNeupId) {
      const neupIdRecord = await prisma.neupId.findUnique({ where: { id: requestedNeupId } });
      memberId = neupIdRecord?.accountId || null;
    } else {
      memberId = authenticatedAccountId;
    }

    if (!memberId) {
      return { status: 404, body: { error: 'not_found', error_description: 'Requested user not found' } };
    }

    const account = await prisma.account.findUnique({
      where: { id: memberId },
      include: {
        contacts: true,
        neupIds: { where: { isPrimary: true }, take: 1 },
        individualProfile: true,
        brandProfile: true,
      },
    });

    if (!account) {
      return { status: 404, body: { error: 'not_found', error_description: 'User profile not found' } };
    }

    const isSelf = memberId === authenticatedAccountId;

    if (isSelf || isTempTokenAuth) {
      const emails = account.contacts.filter((c) => c.contactType === 'email').map((c) => c.value);
      const phones = account.contacts.filter((c) => c.contactType === 'phone').map((c) => c.value);

      return {
        status: 200,
        body: {
          success: true,
          profile: {
            aid: account.id,
            neupId: account.neupIds[0]?.id,
            displayName: account.brandProfile?.brandName || account.displayName,
            displayImage: account.displayImage || DEFAULT_ACCOUNT_AVATAR,
            firstName: account.individualProfile?.firstName,
            middleName: account.individualProfile?.middleName,
            lastName: account.individualProfile?.lastName,
            dob: account.individualProfile?.dateOfBirth?.toISOString(),
            nationality: account.individualProfile?.countryOfResidence,
            verified: account.isVerified,
            accountType: account.accountType,
            isLegalEntity: account.brandProfile?.isLegalEntity,
            countryOfOrigin: account.brandProfile?.originCountry,
            dateEstablished: account.brandProfile ? account.createdAt.toISOString() : undefined,
            emails,
            phones,
            contacts: account.contacts.map((c) => ({ type: c.contactType, value: c.value })),
          },
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        profile: {
          aid: account.id,
          neupId: account.neupIds[0]?.id,
          displayName: account.brandProfile?.brandName || account.displayName,
          displayImage: account.displayImage || DEFAULT_ACCOUNT_AVATAR,
          verified: account.isVerified,
          accountType: account.accountType,
        },
      },
    };
  } catch (error) {
    await logError('auth', error, 'bridge_get_profile');
    return { status: 500, body: { error: 'internal_server_error' } };
  }
}
