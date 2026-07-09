import { redirect } from "next/navigation";
import { requireValidSession } from "@/logica/account/guard";

export default async function RootPage() {
  await requireValidSession({ redirectTo: "/auth/start" });

  redirect("/home");
}
