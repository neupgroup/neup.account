import { requireValidSession } from "@/services/account/guard";
import { DashboardLayoutShell } from "./layout-shell";

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireValidSession({ redirectTo: "/auth/start" });

  return <DashboardLayoutShell>{children}</DashboardLayoutShell>;
}
