'use server';

import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {logError} from '@/core/helpers/logger';
import {checkPermissions} from '@/services/user';
import crypto from 'crypto';
import { SYSTEM_CONFIG_KEYS, readSystemConfigData, writeSystemConfigData } from '@/services/manage/site/system-config';

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
        return {success: true};
    } catch (error) {
        await logError('database', error, `deleteSocialLink: ${id}`);
        return {success: false, error: 'Failed to delete link.'};
    }
}
