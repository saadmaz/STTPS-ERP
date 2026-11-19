"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Building2, ChevronDown, LogOut, Menu, Moon, Search, Sun, UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { notificationsApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { CommandPalette } from "./CommandPalette";

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {
      /* storage unavailable */
    }
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
    queueMicrotask(() => setDark(isDark));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
  };
  return [dark, toggle];
}

function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const count = useQuery({ queryKey: ["notifications", "count"], queryFn: notificationsApi.unreadCount, refetchInterval: 60_000 });
  const list = useQuery({ queryKey: ["notifications", "list"], queryFn: () => notificationsApi.list(), enabled: open });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });
  const unread = count.data?.count ?? 0;

  return (
    <div className="relative">
      <button className="relative btn-ghost" onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 card shadow-lg z-20">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
              <p className="text-sm font-semibold">Notifications</p>
              <button className="text-xs text-blue-600 hover:underline disabled:opacity-50" onClick={() => markAll.mutate()} disabled={unread === 0}>
                Mark all read
              </button>
            </div>
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {(list.data ?? []).slice(0, 15).map((n) => (
                <li key={n.id}>
                  <button
                    className={clsx("w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800", !n.readAt && "bg-blue-50/60 dark:bg-blue-950/30")}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      setOpen(false);
                      if (n.link) router.push(n.link);
                    }}
                  >
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </button>
                </li>
              ))}
              {list.data?.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">You&apos;re all caught up</li>}
            </ul>
            <Link href="/notifications" onClick={() => setOpen(false)} className="block text-center text-xs text-blue-600 py-2 border-t border-slate-200 dark:border-slate-800">
              See all
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, companies, activeCompany, switchCompany, logout } = useAuth();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dark, toggleTheme] = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase() || "U";

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 lg:px-6 gap-2 shrink-0">
      <button className="btn-ghost lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>
      <button
        className="flex items-center gap-2 flex-1 max-w-md h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-400 hover:border-slate-300"
        onClick={() => setPaletteOpen(true)}
      >
        <Search size={15} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden sm:inline text-[10px] border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
      <div className="flex-1" />

      {companies.length > 0 && (
        <div className="relative">
          <button
            onClick={() => {
              setCompanyOpen(!companyOpen);
              setUserOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
          >
            <Building2 size={15} className="text-slate-500" />
            <span className="font-medium max-w-[140px] truncate hidden sm:inline">{activeCompany?.name || "Select company"}</span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          {companyOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCompanyOpen(false)} />
              <div className="absolute right-0 mt-2 w-64 card shadow-lg z-20 py-1">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => {
                      switchCompany(company.id);
                      setCompanyOpen(false);
                    }}
                    className={clsx("w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800", activeCompany?.id === company.id && "text-blue-600 font-medium")}
                  >
                    {company.name} <span className="text-xs text-slate-400">{company.currency}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button className="btn-ghost" onClick={toggleTheme} aria-label={dark ? "Use light theme" : "Use dark theme"}>
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <NotificationBell />

      <div className="relative">
        <button
          onClick={() => {
            setUserOpen(!userOpen);
            setCompanyOpen(false);
          }}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          aria-label="Account menu"
        >
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">{initials}</div>
          <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
        </button>
        {userOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
            <div className="absolute right-0 mt-2 w-60 card shadow-lg z-20 py-1">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-medium">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{user?.email}</p>
              </div>
              <Link href="/settings/delegations" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <UserCheck size={15} className="text-slate-400" /> My delegations
              </Link>
              <button onClick={logout} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
