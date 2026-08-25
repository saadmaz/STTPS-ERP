import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Root route — decide in one server-side hop:
 *   • Session cookie present  → go straight to /dashboard
 *   • No session cookie       → go to /login (middleware would catch it anyway,
 *                               but this avoids the extra /dashboard round-trip)
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSession = cookieStore.get("sttps_session");
  redirect(hasSession ? "/dashboard" : "/login");
}
