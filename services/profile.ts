'use server';

import { permission } from '@/neup.logica/permission';
import prisma from '@/core/helpers/prisma';
import { getPersonalAccountId } from '@/core/auth/verify';
import { logError } from '@/core/helpers/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { format, isValid, parse as parseWithFormat } from 'date-fns';
import { brandLegalFormSchema, brandProfileFormSchema } from '@/services/profile/schema';
import { getUserProfile, checkGrantedPermissions, checkPermissions, checkNeupIdAvailability, getUserNeupIds, type UserProfile } from '@/services/user';
import { logActivity } from '@/services/log-actions';
import { activityAction } from '@/services/activity-action';
import { getAITextResponse } from '@/services/shared/ai';
import { logDisplayImageResourceForAccount } from '@/services/manage/site/resources';
import { dispatchAccountUpdatedEvent, type AccountUpdateEventField } from '@/services/applications/account-update-events';
import { extractGenderFromDetails, resolveDisplayImage } from '@/core/helpers/display-image';
import { assertHasProfileDisplayPermission } from '@/core/auth/profile-permissions';
import { resolveAccessProfileContext } from '@/core/auth/access-profile-context';
import { createNotification } from '@/services/notifications';

const servicePermissions = [
    permission('profile.display.view.self', 'for_individual', 'service'),
    permission('profile.display.update.self', 'for_individual', 'service'),
    permission('profile.display.view.managed', 'for_individual', 'service'),
    permission('profile.display.update.managed', 'for_individual', 'service'),
    permission('profile.display.view.root', 'for_individual', 'service'),
    permission('profile.display.update.root', 'for_individual', 'service'),
    permission('profile.contact.view', 'for_individual', 'service'),
    permission('profile.contact.update', 'for_individual', 'service'),
    permission('profile.neupid.view', 'for_individual', 'service'),
    permission('profile.neupid.update', 'for_individual', 'service'),
    permission('profile.neupid.request', 'for_individual', 'service'),
    permission('profile.neupid.remove', 'for_individual', 'service'),
    permission('profile.legal.update', 'for_individual', 'service'),
    permission('profile.demographics.update', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::profile-service-module
 * ::title Profile Service
 *
 * Provides profile-facing read and write helpers for display data, contacts, NeupIDs, and brand profile updates.
 *
 * ::public
 *
 * This module powers profile-edit screens, public/profile bridge payload composition, display-image history, and brand-profile update flows.
 *
 * ::public end
 *
 * ::private
 *
 * The service mixes direct account writes, request creation, activity logging, notifications, and downstream account-update dispatching.
 *
 * ::private end
 *
 * ::end
 */

/**
 * Function getDisplayNameSuggestions.
 */
export async function getDisplayNameSuggestions(accountId: string): Promise<string[]> {
    /**
     * ::neup.documentation::profile-service-get-display-name-suggestions
     * ::function getDisplayNameSuggestions(accountId)
     *
     * Returns suggested display names for one account based on its current profile data.
     *
     * ::public
     *
     * Individual accounts get suggestions derived from first, middle, and last name combinations, while brand accounts use brand and legal names.
     *
     * ::public end
     *
     * ::private
     *
     * Access is gated through the display-profile view permission for the target account.
     *
     * ::private end
     *
     * ::end
     */
    await assertHasProfileDisplayPermission(accountId, 'view');
    const profile = await getUserProfile(accountId);
    if (!profile) return [];

    if (profile.accountType === 'brand') {
        const suggestions = new Set<string>();

        if (profile.brandName?.trim()) {
            suggestions.add(profile.brandName.trim());
        }
        if (profile.nameLegal?.trim()) {
            suggestions.add(profile.nameLegal.trim());
        }

        return Array.from(suggestions);
    }

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
    await assertHasProfileDisplayPermission(accountId, 'view');
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

export type PublicDisplayImage = {
    id: string;
    type: 'displayImage_publicMale' | 'displayImage_publicFemale';
    value: string;
    title: string | null;
};

export type SelectedProfilePageData = {
    accountId: string;
    profile: UserProfile;
    permissions: string[];
};

export async function getSelectedProfilePageData(input: {
    selectedProfile?: string | null;
    workingProfile?: string | null;
    requiredPermissions: readonly string[];
}): Promise<SelectedProfilePageData | null> {
    /**
     * ::neup.documentation::profile-service-get-selected-profile-page-data
     * ::function getSelectedProfilePageData(input)
     *
     * Resolves the profile data and permission snapshot for a URL-selected profile page.
     *
     * ::public
     *
     * Use this from `/profile/*?selectedProfile=[id]` screens so they render the selected account without switching the active account.
     *
     * ::public end
     *
     * ::private
     *
     * The resolver mirrors access pages by validating `selectedProfile` and `workingProfile` through the shared selected-profile context before returning profile data.
     *
     * ::private end
     *
     * ::end
     */
    if (!input.selectedProfile) return null;

    const accessContext = await resolveAccessProfileContext({
        selectedProfile: input.selectedProfile,
        workingProfile: input.workingProfile,
        requiredPermissions: input.requiredPermissions,
    });
    if (!accessContext) return null;

    const profile = await getUserProfile(accessContext.selectedProfile);
    if (!profile) return null;

    return {
        accountId: accessContext.selectedProfile,
        profile,
        permissions: accessContext.permissions,
    };
}

async function hasTargetProfilePermission(
    accountId: string,
    requiredPermissions: readonly string[],
): Promise<boolean> {
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) return false;

    if (accountId === personalAccountId) {
        return Promise.all(requiredPermissions.map((requiredPermission) => checkPermissions([requiredPermission])))
            .then((results) => results.some(Boolean));
    }

    const [managedResults, rootResults] = await Promise.all([
        Promise.all(
            requiredPermissions.map((requiredPermission) =>
                checkGrantedPermissions([requiredPermission], personalAccountId, accountId)
            )
        ),
        Promise.all(requiredPermissions.map((requiredPermission) => checkPermissions([requiredPermission]))),
    ]);

    return managedResults.some(Boolean) || rootResults.some(Boolean);
}

export async function getPublicDisplayImages(accountId: string): Promise<PublicDisplayImage[]> {
    await assertHasProfileDisplayPermission(accountId, 'view');
    try {
        const rows = await prisma.resource.findMany({
            where: {
                accountId: null,
                type: {
                    in: ['displayImage_publicMale', 'displayImage_publicFemale'],
                },
            },
            orderBy: { uploadedOn: 'desc' },
            select: {
                id: true,
                type: true,
                value: true,
                details: true,
            },
            take: 200,
        });

        return rows
            .map((row) => {
                const details = row.details && typeof row.details === 'object'
                    ? (row.details as Record<string, unknown>)
                    : {};
                const titleRaw = typeof details.title === 'string' ? details.title.trim() : '';

                return {
                    id: row.id,
                    type: row.type as 'displayImage_publicMale' | 'displayImage_publicFemale',
                    value: row.value,
                    title: titleRaw || null,
                };
            })
            .filter((row) => !!row.value?.trim());
    } catch (error) {
        await logError('database', error, 'getPublicDisplayImages');
        return [];
    }
}

export async function getProfileContacts(accountId: string) {
    /**
     * ::neup.documentation::profile-service-get-profile-contacts
     * ::function getProfileContacts(accountId)
     *
     * Returns the contact fields stored for one account.
     *
     * ::public
     *
     * The result is a key-value object indexed by contact type, such as phone and location entries.
     *
     * ::public end
     *
     * ::private
     *
     * Callers must satisfy either contact-view or contact-update permission before the lookup is allowed.
     *
     * ::private end
     *
     * ::end
     */
    if (!await hasTargetProfilePermission(accountId, ['profile.contact.view', 'profile.contact.update'])) {
        throw new Error('You do not have permission to view this profile contact information.');
    }
    const rows = await prisma.contact.findMany({
        where: { accountId },
    });

    return rows.reduce<Record<string, string>>((acc, row) => {
        if (row.contactType) {
            acc[row.contactType] = row.value;
        }
        return acc;
    }, {});
}

export async function getProfileNeupIds(accountId: string) {
    /**
     * ::neup.documentation::profile-service-get-profile-neup-ids
     * ::function getProfileNeupIds(accountId)
     *
     * Returns the NeupID records attached to one account.
     *
     * ::public
     *
     * Use this helper when profile screens need more than the primary NeupID string.
     *
     * ::public end
     *
     * ::private
     *
     * Access is allowed only when one of the NeupID view/update/request/remove permissions is available.
     *
     * ::private end
     *
     * ::end
     */
    if (!await hasTargetProfilePermission(accountId, ['profile.neupid.view', 'profile.neupid.update', 'profile.neupid.request', 'profile.neupid.remove'])) {
        throw new Error('You do not have permission to view this profile NeupID information.');
    }
    return prisma.neupId.findMany({
        where: { accountId },
    });
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
    /**
     * ::neup.documentation::profile-service-update-user-profile
     * ::function updateUserProfile(accountId, data, geolocation)
     *
     * Updates an individual account profile, contacts, display image, and optional NeupID request state.
     *
     * ::public
     *
     * This is the main profile-update entry point for display, legal, demographic, contact, and new-NeupID-request flows.
     *
     * ::public end
     *
     * ::private
     *
     * The implementation evaluates section-specific permissions, performs transactional writes, logs activity and notifications, and dispatches downstream account update events.
     *
     * ::private end
     *
     * ::end
     */
    const actorAccountId = await getPersonalAccountId();
    const wantsDisplayUpdate = data.accountPhoto !== undefined || data.nameDisplay !== undefined || data.customDisplayNameRequest !== undefined;
    const wantsLegalUpdate = data.nameFirst !== undefined || data.nameMiddle !== undefined || data.nameLast !== undefined;
    const wantsDemographicsUpdate = data.gender !== undefined || data.customGender !== undefined || data.dateBirth !== undefined || data.nationality !== undefined || data.isMinor !== undefined;
    const wantsContactUpdate = data.primaryPhone !== undefined || data.secondaryPhone !== undefined || data.permanentLocation !== undefined || data.currentLocation !== undefined || data.workLocation !== undefined || data.otherLocation !== undefined;
    const wantsNeupIdRequest = typeof data.newNeupIdRequest === 'string' && data.newNeupIdRequest.trim().length > 0;

    const [canUpdateDisplay, canUpdateLegal, canUpdateDemographics, canUpdateContact, canRequestNeupId] = await Promise.all([
        assertHasProfileDisplayPermission(accountId, 'update').then(() => true).catch(() => false),
        hasTargetProfilePermission(accountId, ['profile.legal.update']),
        hasTargetProfilePermission(accountId, ['profile.demographics.update']),
        hasTargetProfilePermission(accountId, ['profile.contact.update']),
        hasTargetProfilePermission(accountId, ['profile.neupid.request']),
    ]);

    if (
        (wantsDisplayUpdate && !canUpdateDisplay) ||
        (wantsLegalUpdate && !canUpdateLegal) ||
        (wantsDemographicsUpdate && !canUpdateDemographics) ||
        (wantsContactUpdate && !canUpdateContact) ||
        (wantsNeupIdRequest && !canRequestNeupId)
    ) {
         return { success: false, error: "You do not have permission to update this profile." }
    }

    if (!accountId) {
        return { success: false, error: "User not authenticated." }
    }

    try {
        const changedFields = new Set<AccountUpdateEventField>();
        const beforeSnapshot = await prisma.account.findUnique({
            where: { id: accountId },
            select: {
                details: true,
                displayName: true,
                displayImage: true,
                individualProfile: {
                    select: {
                        dateOfBirth: true,
                        firstName: true,
                        middleName: true,
                        lastName: true,
                        details: true,
                        countryOfResidence: true,
                    },
                },
                neupIds: {
                    where: { isPrimary: true },
                    select: { neupId: true },
                    take: 1,
                },
            },
        });

        const currentAccountDetails =
            beforeSnapshot?.details && typeof beforeSnapshot.details === 'object'
                ? { ...(beforeSnapshot.details as Record<string, unknown>) }
                : {};
        const currentIndividualDetails =
            beforeSnapshot?.individualProfile?.details && typeof beforeSnapshot.individualProfile.details === 'object'
                ? { ...(beforeSnapshot.individualProfile.details as Record<string, unknown>) }
                : {};

        if (data.gender !== undefined) changedFields.add('gender');
        if (data.dateBirth !== undefined) changedFields.add('dateOfBirth');
        if (data.roleId !== undefined || data.role !== undefined) changedFields.add('role');
        if (data.isMinor !== undefined) changedFields.add('isMinor');
        if (data.accountType !== undefined) changedFields.add('accountType');

        await prisma.$transaction(async (tx: any) => {

            if (canUpdateDisplay || canUpdateLegal || canUpdateDemographics) {
                const accountData: Record<string, any> = {};
                const individualProfileData: Record<string, any> = {};
                const nextAccountDetails = { ...currentAccountDetails };
                const nextIndividualDetails = { ...currentIndividualDetails };

                if (canUpdateDemographics && data.gender !== undefined) {
                    nextAccountDetails.gender = data.gender;
                }
                if (canUpdateDemographics && data.customGender !== undefined) {
                    nextAccountDetails.customGender = data.customGender?.trim() ? data.customGender.trim() : null;
                }
                if (canUpdateDemographics && data.isMinor !== undefined) {
                    nextAccountDetails.isMinor = data.isMinor;
                }

                if (canUpdateLegal && data.nameFirst !== undefined) {
                    individualProfileData.firstName = data.nameFirst;
                }
                if (canUpdateLegal && data.nameMiddle !== undefined) {
                    individualProfileData.middleName = data.nameMiddle;
                }
                if (canUpdateLegal && data.nameLast !== undefined) {
                    individualProfileData.lastName = data.nameLast;
                }
                if (canUpdateDemographics && data.dateBirth !== undefined) {
                    individualProfileData.dateOfBirth = data.dateBirth;
                }
                if (canUpdateDemographics && data.nationality !== undefined) {
                    individualProfileData.countryOfResidence = data.nationality;
                }

                if (Object.keys(nextAccountDetails).length > 0) {
                    accountData.details = nextAccountDetails;
                }
                if (Object.keys(nextIndividualDetails).length > 0) {
                    individualProfileData.details = nextIndividualDetails;
                }

                const hasNameChange = ['nameFirst', 'nameMiddle', 'nameLast'].some(key => data[key] !== undefined);
                if (hasNameChange) {
                    const newFirstName = data.nameFirst ?? beforeSnapshot?.individualProfile?.firstName;
                    const newMiddleName = data.nameMiddle ?? beforeSnapshot?.individualProfile?.middleName;
                    const newLastName = data.nameLast ?? beforeSnapshot?.individualProfile?.lastName;
                    
                    let defaultDisplayName = `${newFirstName || ''} ${newLastName || ''}`.trim();
                    if (newMiddleName) {
                        defaultDisplayName = `${newFirstName || ''} ${newMiddleName} ${newLastName || ''}`.trim();
                    }
                    accountData.displayName = defaultDisplayName;
                }
                
                if (canUpdateDisplay && data.customDisplayNameRequest) {
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
                    delete accountData.displayName;
                }

                if (canUpdateDisplay && typeof data.nameDisplay === 'string' && !data.customDisplayNameRequest) {
                    accountData.displayName = data.nameDisplay;
                }
                if (canUpdateDisplay && typeof data.accountPhoto === 'string') {
                    accountData.displayImage = data.accountPhoto.trim() || null;
                }

                const updateData: Record<string, any> = { ...accountData };
                if (Object.keys(individualProfileData).length > 0) {
                    updateData.individualProfile = {
                        upsert: {
                            create: individualProfileData,
                            update: individualProfileData,
                        },
                    };
                }

                if (Object.keys(updateData).length > 0) {
                    await tx.account.update({
                        where: { id: accountId },
                        data: updateData,
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
            
            if (canRequestNeupId && wantsNeupIdRequest) {
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

                await tx.request.updateMany({
                    where: {
                        senderId: accountId,
                        action: 'neupid_request',
                        status: 'pending',
                    },
                    data: { status: 'cancelled' },
                });

                const neupIdRequest = await tx.request.create({
                    data: {
                        senderId: accountId,
                        recipientId: accountId,
                        action: 'neupid_request',
                        type: 'neupid',
                        status: 'pending',
                        data: { requestedNeupId, requestor: requesterId, requestId: '' } as any,
                    }
                });
                await tx.request.update({
                    where: { id: neupIdRequest.id },
                    data: {
                        data: { requestedNeupId, requestor: requesterId, requestId: neupIdRequest.id } as any,
                    },
                });

                const currentAccount = await tx.account.findUnique({
                    where: { id: accountId },
                    select: { details: true },
                });
                const currentDetails =
                    currentAccount?.details && typeof currentAccount.details === 'object'
                        ? { ...(currentAccount.details as Record<string, unknown>) }
                        : {};
                const pendingRequests =
                    currentDetails.pendingRequests && typeof currentDetails.pendingRequests === 'object'
                        ? { ...(currentDetails.pendingRequests as Record<string, unknown>) }
                        : {};
                pendingRequests.neupid = {
                    requestId: neupIdRequest.id,
                    requestedNeupId,
                    status: 'pending',
                    requestedAt: new Date().toISOString(),
                };
                currentDetails.pendingRequests = pendingRequests;
                await tx.account.update({
                    where: { id: accountId },
                    data: { details: currentDetails },
                });

                await logActivity(accountId, `Requested New NeupID: ${requestedNeupId}`, 'Pending', undefined, geolocation);
            }

            await updateOrCreateContact(tx, accountId, 'primaryPhone', data.primaryPhone, canUpdateContact);
            await updateOrCreateContact(tx, accountId, 'secondaryPhone', data.secondaryPhone, canUpdateContact);
            await updateOrCreateContact(tx, accountId, 'permanentLocation', data.permanentLocation, canUpdateContact);
            await updateOrCreateContact(tx, accountId, 'currentLocation', data.currentLocation, canUpdateContact);
            await updateOrCreateContact(tx, accountId, 'workLocation', data.workLocation, canUpdateContact);
            await updateOrCreateContact(tx, accountId, 'otherLocation', data.otherLocation, canUpdateContact);
        });

        const afterSnapshot = await prisma.account.findUnique({
            where: { id: accountId },
            select: {
                displayName: true,
                displayImage: true,
                individualProfile: {
                    select: { dateOfBirth: true },
                },
                neupIds: {
                    where: { isPrimary: true },
                    select: { neupId: true },
                    take: 1,
                },
            },
        });

        if ((beforeSnapshot?.displayName ?? null) !== (afterSnapshot?.displayName ?? null)) {
            changedFields.add('displayName');
        }
        if ((beforeSnapshot?.displayImage ?? null) !== (afterSnapshot?.displayImage ?? null)) {
            changedFields.add('displayImage');
        }
        const beforePrimaryNeupId = beforeSnapshot?.neupIds[0]?.neupId ?? null;
        const afterPrimaryNeupId = afterSnapshot?.neupIds[0]?.neupId ?? null;
        if (beforePrimaryNeupId !== afterPrimaryNeupId) {
            changedFields.add('neupId');
        }
        
        const beforeDisplayImage = beforeSnapshot?.displayImage ?? null;
        const afterDisplayImage = afterSnapshot?.displayImage ?? null;
        const beforeDisplayName = beforeSnapshot?.displayName ?? '';
        const afterDisplayName = afterSnapshot?.displayName ?? '';
        const beforeDob = beforeSnapshot?.individualProfile?.dateOfBirth
            ? beforeSnapshot.individualProfile.dateOfBirth.toISOString().slice(0, 10)
            : '';
        const afterDob = afterSnapshot?.individualProfile?.dateOfBirth
            ? afterSnapshot.individualProfile.dateOfBirth.toISOString().slice(0, 10)
            : '';

        if (beforeDisplayName !== afterDisplayName) {
            await logActivity(
                accountId,
                activityAction.profileNameChanged(beforeDisplayName, afterDisplayName),
                'Success',
                undefined,
                undefined,
                geolocation
            );
            await createNotification({
                recipient_id: accountId,
                action: 'informative.profile.display_name_changed',
                message: `Display name changed from "${beforeDisplayName || 'N/A'}" to "${afterDisplayName || 'N/A'}".`,
                noticeType: 'success',
                persistence: 'dismissable',
            });
        }

        if (beforeDob !== afterDob) {
            await logActivity(
                accountId,
                activityAction.profileDobChanged(beforeDob, afterDob),
                'Success',
                undefined,
                undefined,
                geolocation
            );
        }

        if (beforeDisplayImage !== afterDisplayImage) {
            await logActivity(
                accountId,
                activityAction.profileDisplayImageChanged(beforeDisplayImage || '', afterDisplayImage || ''),
                'Success',
                undefined,
                undefined,
                geolocation
            );
            await createNotification({
                recipient_id: accountId,
                action: 'informative.profile.display_image_changed',
                message: 'Your display image was updated.',
                noticeType: 'success',
                persistence: 'dismissable',
            });
        }

        if (
            beforeDisplayName === afterDisplayName &&
            beforeDob === afterDob &&
            beforeDisplayImage === afterDisplayImage
        ) {
            await logActivity(accountId, 'Profile Update', 'Success', undefined, undefined, geolocation);
        }

        if (changedFields.size > 0) {
            const dispatchResult = await dispatchAccountUpdatedEvent({
                accountId,
                changedFields: Array.from(changedFields),
            });

            if (dispatchResult.sent > 0 && dispatchResult.succeeded === 0) {
                await logError('webhook', new Error('No downstream app returned success for account update event.'), `dispatchAccountUpdatedEvent:${accountId}`);
            }
        }
        
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
    /**
     * ::neup.documentation::profile-service-update-brand-profile
     * ::function updateBrandProfile(accountId, data, locationString)
     *
     * Updates the editable brand-profile fields for one account.
     *
     * ::public
     *
     * The update can change display name, display image, legal-entity state, legal name, registration ID, origin country, and establishment date.
     *
     * ::public end
     *
     * ::private
     *
     * Legal-name changes can also update the display name when the previous display name matched the prior legal name.
     *
     * ::private end
     *
     * ::end
     */
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) {
        return { success: false, error: "User not authenticated." };
    }

    const validation = brandProfileFormSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: "Invalid data provided.", details: validation.error.flatten() };
    }

    try {
        const beforeAccount = await prisma.account.findUnique({
            where: { id: accountId },
            select: {
                displayName: true,
                displayImage: true,
                brandProfile: {
                    select: {
                        isLegalEntity: true,
                        originCountry: true,
                        details: true,
                    },
                },
            },
        });
        const beforeDetails =
            beforeAccount?.brandProfile?.details && typeof beforeAccount.brandProfile.details === "object"
                ? (beforeAccount.brandProfile.details as Record<string, unknown>)
                : {};
        const beforeLegalName = typeof beforeDetails.nameLegal === "string" ? beforeDetails.nameLegal : "";
        const beforeDisplayName = beforeAccount?.displayName?.trim() || "";

        const accountData: Record<string, any> = {};
        const brandProfileData: Record<string, any> = {};
        const nextBrandDetails = { ...beforeDetails };

        if (validation.data.nameDisplay !== undefined) {
            accountData.displayName = validation.data.nameDisplay;
        }
        if (validation.data.accountPhoto !== undefined) {
            accountData.displayImage = validation.data.accountPhoto.trim() || null;
        }
        if (validation.data.isLegalEntity !== undefined) {
            brandProfileData.isLegalEntity = validation.data.isLegalEntity;
        }
        if (validation.data.nameLegal !== undefined) {
            nextBrandDetails.nameLegal = validation.data.nameLegal.trim() || null;
            const nextLegalName = validation.data.nameLegal.trim();
            const submittedDisplayName = validation.data.nameDisplay?.trim() || "";
            if (
                beforeLegalName.trim().length > 0 &&
                beforeDisplayName === beforeLegalName.trim() &&
                submittedDisplayName === beforeLegalName.trim()
            ) {
                accountData.displayName = nextLegalName;
            }
        }
        if (validation.data.registrationId !== undefined) {
            nextBrandDetails.registrationId = validation.data.registrationId.trim() || null;
        }
        if (validation.data.countryOfOrigin !== undefined) {
            brandProfileData.originCountry = validation.data.countryOfOrigin.trim() || null;
        }
        if (validation.data.dateEstablished !== undefined) {
            nextBrandDetails.dateEstablished = validation.data.dateEstablished.toISOString();
        }
        if (Object.keys(nextBrandDetails).length > 0) {
            brandProfileData.details = nextBrandDetails;
        }

        const updateData: Record<string, any> = { ...accountData };
        if (Object.keys(brandProfileData).length > 0) {
            updateData.brandProfile = {
                upsert: {
                    create: brandProfileData,
                    update: brandProfileData,
                },
            };
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.account.update({
                where: { id: accountId },
                data: updateData,
            });
        }

        const afterLegalName = (validation.data.nameLegal || "").trim();
        if (beforeLegalName.trim() !== afterLegalName) {
            await logActivity(
                accountId,
                activityAction.profileLegalNameChanged(beforeLegalName, afterLegalName),
                "Success",
                undefined,
                undefined,
                locationString
            );
        }
        revalidatePath('/manage/profile');
        
        return { success: true, message: "Brand profile updated successfully." };
    } catch (error) {
        await logError('database', error, 'updateBrandProfile');
        return { success: false, error: 'An unexpected error occurred while updating your profile.' };
    }
}

export async function updateBrandLegalProfile(
    accountId: string,
    data: z.infer<typeof brandLegalFormSchema>,
    locationString?: string,
) {
    /**
     * ::neup.documentation::profile-service-update-brand-legal-profile
     * ::function updateBrandLegalProfile(accountId, data, locationString)
     *
     * Updates the legal-profile fields for a brand account.
     *
     * ::public
     *
     * This helper is used when the legal-entity-specific brand information must be changed with delegated-account support.
     *
     * ::public end
     *
     * ::private
     *
     * Permission checks distinguish self updates from managed-account updates before validating and persisting the new legal data.
     *
     * ::private end
     *
     * ::end
     */
    const personalAccountId = await getPersonalAccountId();
    if (!personalAccountId) {
        return { success: false, error: "User not authenticated." };
    }

    const canUpdateLegal = accountId === personalAccountId
        ? await checkPermissions(['profile.legal.update'])
        : await checkGrantedPermissions(['profile.legal.update'], personalAccountId, accountId);

    if (!canUpdateLegal) {
        return { success: false, error: "You do not have permission to update this profile." };
    }

    const validation = brandLegalFormSchema.safeParse(data);
    if (!validation.success) {
        return { success: false, error: "Invalid data provided.", details: validation.error.flatten() };
    }

    try {
        const beforeAccount = await prisma.account.findUnique({
            where: { id: accountId },
            select: {
                displayName: true,
                brandProfile: {
                    select: {
                        isLegalEntity: true,
                        details: true,
                    },
                },
            },
        });

        const beforeDetails =
            beforeAccount?.brandProfile?.details && typeof beforeAccount.brandProfile.details === 'object'
                ? (beforeAccount.brandProfile.details as Record<string, unknown>)
                : {};
        const beforeLegalName = typeof beforeDetails.nameLegal === 'string' ? beforeDetails.nameLegal.trim() : '';
        const beforeDisplayName = beforeAccount?.displayName?.trim() || '';
        const nextLegalName = validation.data.isLegalEntity
            ? validation.data.nameLegal?.trim() || ''
            : '';

        const brandProfileData: Record<string, any> = {
            isLegalEntity: validation.data.isLegalEntity,
        };
        const nextBrandDetails = { ...beforeDetails };

        if (validation.data.isLegalEntity) {
            nextBrandDetails.nameLegal = validation.data.nameLegal?.trim() || null;
            nextBrandDetails.dateEstablished = validation.data.dateEstablished?.toISOString() || null;
        } else {
            nextBrandDetails.nameLegal = null;
            nextBrandDetails.dateEstablished = null;
        }

        brandProfileData.details = nextBrandDetails;

        await prisma.$transaction(async (tx: any) => {
            const accountData: Record<string, any> = {};
            if (
                beforeLegalName.length > 0 &&
                beforeDisplayName === beforeLegalName &&
                beforeLegalName !== nextLegalName
            ) {
                accountData.displayName = nextLegalName || null;
            }

            await tx.account.update({
                where: { id: accountId },
                data: {
                    ...accountData,
                    brandProfile: {
                        upsert: {
                            create: brandProfileData,
                            update: brandProfileData,
                        },
                    },
                },
            });

            await updateOrCreateContact(
                tx,
                accountId,
                'headOfficeLocation',
                validation.data.isLegalEntity ? validation.data.headOfficeLocation?.trim() : undefined,
                true,
            );
        });

        revalidatePath('/manage/profile');
        revalidatePath('/manage/profile/legal');

        return { success: true, message: 'Brand legal information updated successfully.' };
    } catch (error) {
        await logError('database', error, 'updateBrandLegalProfile');
        return { success: false, error: 'An unexpected error occurred while updating legal information.' };
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
