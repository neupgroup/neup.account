
'use server';

import type { SocialLink } from '@/services/manage/site/socials';
import { getPaymentSettings } from '@/services/manage/site/payments';
import { SYSTEM_CONFIG_KEYS, readSystemConfigData } from '@/services/manage/site/system-config';

/**
 * Type AppInfo.
 */
export type AppInfo = {
    name: string;
    version: string;
    description: string;
    whatsappContact?: string;
    instagramContact?: string;
    linkedinContact?: string;
};


/**
 * Type PaymentDetails.
 */
export type PaymentDetails = {
    qrCodeUrl?: string;
    bankDetails?: string;
};


/**
 * Function getAppInfo.
 */
export async function getAppInfo(): Promise<AppInfo | null> {
    const data = await readSystemConfigData<{ links?: SocialLink[] }>(SYSTEM_CONFIG_KEYS.socials, {});
    const links = data.links || [];

    const findByType = (type: SocialLink['type']) =>
        links.find((link) => link.type === type && link.isVisible)?.url;

    const whatsappRaw = findByType('whatsapp');
    const instagramRaw = findByType('instagram');
    const linkedinRaw = findByType('linkedin');

    return {
        name: 'NeupID',
        version: '1.0.0',
        description: 'Unified account management for Neup ecosystem.',
        whatsappContact: whatsappRaw,
        instagramContact: instagramRaw,
        linkedinContact: linkedinRaw,
    };
}


/**
 * Function getPaymentDetails.
 */
export async function getPaymentDetails(): Promise<PaymentDetails | null> {
    try {
        const settings = await getPaymentSettings({ requirePermission: false });
        const lines: string[] = [];

        if (settings.providerName) lines.push(`Provider: ${settings.providerName}`);
        if (settings.accountName) lines.push(`Account Name: ${settings.accountName}`);
        if (settings.accountNumber) lines.push(`Account Number: ${settings.accountNumber}`);
        if (settings.ifscCode) lines.push(`IFSC / Routing: ${settings.ifscCode}`);
        if (settings.upiId) lines.push(`UPI ID: ${settings.upiId}`);
        if (settings.notes) {
            lines.push('');
            lines.push(settings.notes);
        }

        const bankDetails = lines.length > 0 ? lines.join('\n') : undefined;

        return {
            qrCodeUrl: settings.qrCodeUrl,
            bankDetails,
        };
    } catch (_error) {
        return null;
    }
}
