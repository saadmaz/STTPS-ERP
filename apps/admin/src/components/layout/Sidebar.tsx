"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  Shield, LayoutDashboard, Building2, LogOut, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Organizations", href: "/tenants", icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar-bg flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/5">
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold">STTPS Admin</p>
          <p className="text-slate-500 text-xs">Platform Console</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-active text-sidebar-text-active"
                  : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 border-t border-white/5 pt-4">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-bold">
            {user?.firstName?.[0] ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {user ? `${user.firstName} ${user.lastName}` : "Admin"}
            </p>
            <p className="text-slate-500 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-sidebar-hover text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
