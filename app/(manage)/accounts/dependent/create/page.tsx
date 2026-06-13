import { requireAnyPermission404 } from '@/core/auth/permission-guards';
import CreateDependentPageClient from './page.client';

export default async function CreateDependentPage() {
    await requireAnyPermission404(['linked_accounts.dependent.create.self']);
    return <CreateDependentPageClient />;
}
