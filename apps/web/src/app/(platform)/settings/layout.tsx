"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, Settings } from "lucide-react";
import { clsx } from "clsx";

const TABS = [
  { label: "Companies", href: "/settings/companies", icon: Building2 },
  { label: "Users & Roles", href: "/settings/users", icon: Users },
  { label: "System", href: "/settings/system", icon: Settings },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your organisation, users, and system configuration</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300",
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
