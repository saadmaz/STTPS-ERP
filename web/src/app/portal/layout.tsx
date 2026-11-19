"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy, LogOut } from "lucide-react";
import { clearPortalToken, getPortalToken } from "@/lib/portal-api";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = typeof window !== "undefined" && !!getPortalToken();
  const bare = pathname === "/portal/login" || pathname === "/portal/set-password";

  const logout = () => {
    clearPortalToken();
    router.push("/portal/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {!bare && (
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/portal/tickets" className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
              <LifeBuoy size={18} className="text-blue-600" /> Support Portal
            </Link>
            {signedIn && (
              <button className="btn-ghost" onClick={logout}>
                <LogOut size={15} /> Log out
              </button>
            )}
          </div>
        </header>
      )}
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
