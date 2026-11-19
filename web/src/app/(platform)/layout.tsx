"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { WorkspaceProvider } from "@/lib/workspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isAuthenticated, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <p className="text-sm text-slate-500">Loading workspace...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <WorkspaceProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
        {navOpen && <div className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden" onClick={() => setNavOpen(false)} />}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Topbar onMenu={() => setNavOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
