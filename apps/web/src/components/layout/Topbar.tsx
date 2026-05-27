"use client";

import { useAuth } from "@/lib/auth";
import { Building2, ChevronDown, LogOut, Settings, User, Bell } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import Link from "next/link";

export function Topbar({ title }: { title?: string }) {
  const { user, companies, activeCompany, switchCompany, logout } = useAuth();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : "?";

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 flex-shrink-0">
      {/* Page title */}
      <div className="flex-1">
        {title && <h1 className="text-lg font-semibold text-slate-800">{title}</h1>}
      </div>

      {/* Company Switcher */}
      {companies.length > 0 && (
        <div className="relative">
          <button
            onClick={() => { setCompanyOpen(!companyOpen); setUserOpen(false); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
          >
            <Building2 size={15} className="text-slate-500" />
            <span className="font-medium text-slate-700 max-w-[140px] truncate">
              {activeCompany?.name || "Select Company"}
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {companyOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCompanyOpen(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Switch Company</p>
                </div>
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => { switchCompany(company.id); setCompanyOpen(false); }}
                    className={clsx(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors",
                      activeCompany?.id === company.id && "text-blue-600 font-medium",
                    )}
                  >
                    <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center text-xs font-bold text-blue-700">
                      {company.code.slice(0, 2)}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-800">{company.name}</p>
                      <p className="text-xs text-slate-500">{company.currency}</p>
                    </div>
                    {activeCompany?.id === company.id && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Notifications */}
      <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
      </button>

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => { setUserOpen(!userOpen); setCompanyOpen(false); }}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium text-slate-800 leading-none">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
          </div>
          <ChevronDown size={14} className="text-slate-400" />
        </button>

        {userOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-800">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings/users"
                  onClick={() => setUserOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User size={15} className="text-slate-400" />
                  My Profile
                </Link>
                <Link
                  href="/settings/system"
                  onClick={() => setUserOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings size={15} className="text-slate-400" />
                  Settings
                </Link>
              </div>
              <div className="border-t border-slate-100 py-1">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
