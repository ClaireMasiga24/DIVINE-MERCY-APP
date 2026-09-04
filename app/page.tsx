import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { roleSlug } from "@/lib/roles";

/**
 * The PWA splash route (also the manifest's `start_url`).
 *
 * Server-side redirects based on the session cookie:
 *   - Signed in: straight to the user's role dashboard.
 *   - Signed out: to /login.
 *
 * The previous version was a client component that waited 2 s and
 * unconditionally sent every visitor to /login, which felt like being
 * "logged out" on every relaunch. Server-rendering the redirect fixes
 * that and removes the 2 s flash of the splash image.
 */
export default async function Home() {
  const user = await getSessionUser();
  if (user) {
    redirect(`/dashboard/${roleSlug(user.role)}`);
  }
  redirect("/login");
}