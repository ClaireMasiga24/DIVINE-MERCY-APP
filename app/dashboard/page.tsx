import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { roleSlug } from "@/lib/roles";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(`/dashboard/${roleSlug(user.role)}`);
}
