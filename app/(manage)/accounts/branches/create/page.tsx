import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import CreateBranchPageClient from './page.client';

export default async function CreateBranchPage() {
    await requireAnyPermission404(['linked_accounts.brand.manage.self']);
    return <CreateBranchPageClient />;
}
