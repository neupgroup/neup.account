import { requireValidSession } from "@/core/auth/guard";
import { DashboardLayoutShell } from "./layout-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireValidSession({ redirectTo: "/auth/start" });

  return <DashboardLayoutShell>{children}</DashboardLayoutShell>;
}
