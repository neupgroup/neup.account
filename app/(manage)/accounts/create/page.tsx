import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import CreateBrandPageClient from './page.client';

export default async function CreateBrandPage() {
    await requireAnyPermission404(['linked_accounts.brand.create']);
    return <CreateBrandPageClient />;
}
