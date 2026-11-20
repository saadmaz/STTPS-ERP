"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Search } from "lucide-react";
import { platformApi } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import { Spinner } from "@/components/ui/kit";

interface Command {
  label: string;
  hint: string;
  href: string;
  permission?: string;
}

const COMMANDS: Command[] = [
  { label: "Home", hint: "Go to", href: "/dashboard" },
  { label: "My Work", hint: "Go to", href: "/my-work" },
  { label: "Notifications", hint: "Go to", href: "/notifications" },
  { label: "Leads", hint: "CRM", href: "/crm/leads", permission: "crm.lead.view" },
  { label: "Customers", hint: "CRM", href: "/crm/accounts", permission: "crm.account.view" },
  { label: "Contacts", hint: "CRM", href: "/crm/contacts", permission: "crm.contact.view" },
  { label: "Pipeline", hint: "CRM", href: "/crm/pipeline", permission: "crm.opportunity.view" },
  { label: "Activities", hint: "CRM", href: "/crm/activities", permission: "crm.activity.view" },
  { label: "Branches", hint: "Go to", href: "/org/branches", permission: "org.branch.view" },
  { label: "Departments", hint: "Go to", href: "/org/departments", permission: "org.department.view" },
  { label: "Teams", hint: "Go to", href: "/org/teams", permission: "org.team.view" },
  { label: "Cost centres", hint: "Go to", href: "/org/cost-centres", permission: "org.costCentre.view" },
  { label: "Fiscal years", hint: "Go to", href: "/org/fiscal-years", permission: "org.fiscalYear.view" },
  { label: "Exchange rates", hint: "Go to", href: "/org/exchange-rates", permission: "org.exchangeRate.view" },
  { label: "Approval workflows", hint: "Settings", href: "/settings/workflows", permission: "workflow.definition.view" },
  { label: "Custom fields", hint: "Settings", href: "/settings/custom-fields", permission: "platform.customField.view" },
  { label: "My delegations", hint: "Settings", href: "/settings/delegations" },
];

/** ⌘K / Ctrl+K: jump to a screen or find any record (blueprint §36). */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { can } = useWorkspace();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const search = useQuery({ queryKey: ["search", debounced], queryFn: () => platformApi.search(debounced), enabled: open && debounced.length >= 2 });

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const commands = COMMANDS.filter((c) => (!c.permission || can(c.permission)) && c.label.toLowerCase().includes(needle)).slice(0, 6);
    const hits = (search.data ?? []).map((h) => ({ label: h.title, hint: h.subtitle ? `${h.typeLabel} · ${h.subtitle}` : h.typeLabel, href: h.link }));
    return [...hits, ...commands];
  }, [query, search.data, can]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    setQuery("");
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative card w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-slate-200 dark:border-slate-800">
          <Search size={16} className="text-slate-400" />
          <input
            autoFocus
            className="flex-1 h-12 bg-transparent text-sm focus:outline-none"
            placeholder="Search records or jump to a screen"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
              if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
              if (e.key === "Enter" && items[index]) go(items[index]!.href);
            }}
            aria-label="Search"
          />
          {search.isFetching && <Spinner size={14} />}
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-4 py-6 text-sm text-center text-slate-500">{debounced.length >= 2 ? "No results" : "Type to search"}</li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.href}-${i}`}>
                <button
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${i === index ? "bg-blue-50 dark:bg-slate-800" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(item.href)}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="text-xs text-slate-400 truncate max-w-[45%]">{item.hint}</span>
                  {i === index && <CornerDownLeft size={13} className="text-slate-400" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
