import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { roleSlug, roleLabel, ROLE_SECTIONS } from "@/lib/roles";
import DashboardShell from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <DashboardShell
      user={{
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        roleLabel: roleLabel(user.role),
        slug: roleSlug(user.role),
        role: user.role,
        sections: ROLE_SECTIONS[user.role],
      }}
    >
      {children}
    </DashboardShell>
  );
}
