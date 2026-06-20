import type { Metadata } from 'next';
import { createPageMetadata } from '@/core/metadata';

export const metadata: Metadata = createPageMetadata('Link WhatsApp');

export { default } from './page.client';
