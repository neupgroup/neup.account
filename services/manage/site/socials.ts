'use server';

import { permission } from '@/logica/permission';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {logError} from '@/core/helpers/logger';
import {checkPermissions} from '@/services/user';
import crypto from 'crypto';
import { SYSTEM_CONFIG_KEYS, readSystemConfigData, writeSystemConfigData } from '@/services/manage/site/system-config';

const servicePermissions = [
    permission('site.social_accounts.read', 'for_individual', 'service'),
    permission('site.social_accounts.add', 'for_individual', 'service'),
    permission('site.social_accounts.edit', 'for_individual', 'service'),
    permission('site.social_accounts.delete', 'for_individual', 'service'),
    permission('root.payment_config.view', 'for_individual', 'service'),
];

/**
 * ::neup.documentation::manage-site-socials-module
 * ::title Site Social Links Service
 *
 * Reads and manages the configured social media links shown by the site.
 *
 * ::public
 *
 * Use this service to list, add, toggle, and remove social links stored in system config.
 *
 * ::public end
 *
 * ::private
 *
 * Root payment-config viewers are treated as privileged fallbacks for the standard social-link permissions.
 *
 * ::private end
 *
 * ::end
 */

export type SocialLink = {
    id: string;
    type: 'instagram' | 'linkedin' | 'twitter' | 'facebook' | 'whatsapp' | 'other';
    url: string;
    isVisible: boolean;
};


// Database schema for social links.
const formSchema = z.object({
    type: z.enum(['instagram', 'linkedin', 'twitter', 'facebook', 'whatsapp', 'other']),
    url: z.string().url("Please enter a valid URL."),
});


// Fetch all social media links.
export async function getSocialLinks(): Promise<SocialLink[]> {
    /**
     * ::neup.documentation::manage-site-socials-get-links
     * ::function getSocialLinks()
     *
     * Returns the configured social media links.
     *
     * ::public
     *
     * Each link includes its platform type, URL, visibility flag, and generated ID.
     *
     * ::public end
     *
     * ::private
     *
     * Readers can qualify through either the dedicated social-link read permission or the root payment-config permission.
     *
     * ::private end
     *
     * ::end
     */
    const canView =
        (await checkPermissions(['site.social_accounts.read'])) ||
        (await checkPermissions(['root.payment_config.view']));
    if (!canView) return [];

    try {
        const data = await readSystemConfigData<{ links?: SocialLink[] }>(
            SYSTEM_CONFIG_KEYS.socials,
            {},
        );

        return data.links || [];
    } catch (error) {
        await logError('database', error, 'getSocialLinks');
        return [];
    }
}


/**
 * Function addSocialLink.
 */
export async function addSocialLink(formData: FormData): Promise<{
    success: boolean;
    error?: string;
    newLink?: SocialLink
}> {
    /**
     * ::neup.documentation::manage-site-socials-add-link
     * ::function addSocialLink(formData)
     *
     * Adds a new social media link to the stored site configuration.
     *
     * ::public
     *
     * The form accepts a platform type and a valid URL and creates the new link as visible by default.
     *
     * ::public end
     *
     * ::private
     *
     * The link ID is generated server-side and the relevant config routes are revalidated after a successful write.
     *
     * ::private end
     *
     * ::end
     */
    const canAdd =
        (await checkPermissions(['site.social_accounts.add'])) ||
        (await checkPermissions(['root.payment_config.view']));
    if (!canAdd) return {success: false, error: 'Permission denied.'};
    
    const rawData = Object.fromEntries(formData.entries());
    const validation = formSchema.safeParse(rawData);
    
    if (!validation.success) {
        return {
            success: false,
            error: validation.error.flatten().fieldErrors.url?.[0] || validation.error.flatten().fieldErrors.type?.[0]
        };
    }
    
    const {type, url} = validation.data;
    
    try {
        const newLink: SocialLink = {
            id: crypto.randomUUID(),
            type,
            url,
            isVisible: true
        };

        const currentData = await readSystemConfigData<{ links?: SocialLink[] }>(
            SYSTEM_CONFIG_KEYS.socials,
            {},
        );
        const currentLinks = currentData.links || [];
        const success = await writeSystemConfigData(SYSTEM_CONFIG_KEYS.socials, {
            ...currentData,
            links: [...currentLinks, newLink],
        });
        if (!success) {
            return {success: false, error: 'Failed to add new link.'};
        }

        revalidatePath('/manage/site/socials');
        revalidatePath('/config/socials');
        revalidatePath('/site/config/socials');
        return {success: true, newLink};
    } catch (error: any) {
        await logError('database', error, 'addSocialLink');
        return {success: false, error: 'Failed to add new link.'};
    }
}


/**
 * Function toggleSocialLinkVisibility.
 */
export async function toggleSocialLinkVisibility(id: string, isVisible: boolean): Promise<{
    success: boolean;
    error?: string
}> {
    /**
     * ::neup.documentation::manage-site-socials-toggle-visibility
     * ::function toggleSocialLinkVisibility(id, isVisible)
     *
     * Toggles whether a stored social link is visible.
     *
     * ::public
     *
     * Call this when a manage UI needs to show or hide an existing social link without deleting it.
     *
     * ::public end
     *
     * ::private
     *
     * The implementation flips the current stored visibility value for the matching link ID and then revalidates dependent routes.
     *
     * ::private end
     *
     * ::end
     */
    const canEdit =
        (await checkPermissions(['site.social_accounts.edit'])) ||
        (await checkPermissions(['root.payment_config.view']));
    if (!canEdit) return {success: false, error: 'Permission denied.'};

    try {
        const currentData = await readSystemConfigData<{ links?: SocialLink[] }>(
            SYSTEM_CONFIG_KEYS.socials,
            {},
        );
        const links = currentData.links || [];
        const updatedLinks = links.map(link =>
            link.id === id ? {...link, isVisible: !link.isVisible} : link
        );
        const success = await writeSystemConfigData(SYSTEM_CONFIG_KEYS.socials, {
            ...currentData,
            links: updatedLinks,
        });
        if (!success) {
            return {success: false, error: 'Failed to update visibility.'};
        }

        revalidatePath('/manage/site/socials');
        revalidatePath('/config/socials');
        revalidatePath('/site/config/socials');
        return {success: true};
    } catch (error) {
        await logError('database', error, `toggleSocialLinkVisibility: ${id}`);
        return {success: false, error: 'Failed to update visibility.'};
    }
}


/**
 * Function deleteSocialLink.
 */
export async function deleteSocialLink(id: string): Promise<{ success: boolean; error?: string }> {
    /**
     * ::neup.documentation::manage-site-socials-delete-link
     * ::function deleteSocialLink(id)
     *
     * Deletes a stored social link by ID.
     *
     * ::public
     *
     * Use this helper when a social link should be removed entirely from the site config.
     *
     * ::public end
     *
     * ::private
     *
     * Successful deletes rewrite the stored config array and revalidate the social config routes.
     *
     * ::private end
     *
     * ::end
     */
    const canDelete =
        (await checkPermissions(['site.social_accounts.delete'])) ||
        (await checkPermissions(['root.payment_config.view']));
    if (!canDelete) return {success: false, error: 'Permission denied.'};

    try {
        const currentData = await readSystemConfigData<{ links?: SocialLink[] }>(
            SYSTEM_CONFIG_KEYS.socials,
            {},
        );
        const links = currentData.links || [];
        const updatedLinks = links.filter(link => link.id !== id);
        const success = await writeSystemConfigData(SYSTEM_CONFIG_KEYS.socials, {
            ...currentData,
            links: updatedLinks,
        });
        if (!success) {
            return {success: false, error: 'Failed to delete link.'};
        }

        revalidatePath('/manage/site/socials');
        revalidatePath('/config/socials');
        revalidatePath('/site/config/socials');
        return {success: true};
    } catch (error) {
        await logError('database', error, `deleteSocialLink: ${id}`);
        return {success: false, error: 'Failed to delete link.'};
    }
}
