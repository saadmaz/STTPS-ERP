"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  Briefcase,
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FolderTree,
  Package,
  Percent,
  Ruler,
  Tags,
  Contact,
  Handshake,
  KanbanSquare,
  PhoneCall,
  Target,
  GitBranch,
  Home,
  Layers,
  ListChecks,
  Network,
  PieChart,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react";
import { platformApi } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

interface NavLink {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Shown only with this permission. */
  permission?: string;
  /** Shown only to tenant administrators. */
  adminOnly?: boolean;
}

interface NavSection {
  label: string;
  icon: React.ElementType;
  module?: string;
  links: NavLink[];
}

const TOP: NavLink[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "My Work", href: "/my-work", icon: ListChecks },
];

const SECTIONS: NavSection[] = [
  {
    label: "CRM",
    icon: Handshake,
    module: "crm",
    links: [
      { label: "Overview", href: "/crm", icon: PieChart, permission: "crm.analytics.view" },
      { label: "Leads", href: "/crm/leads", icon: Target, permission: "crm.lead.view" },
      { label: "Customers", href: "/crm/accounts", icon: Building2, permission: "crm.account.view" },
      { label: "Contacts", href: "/crm/contacts", icon: Contact, permission: "crm.contact.view" },
      { label: "Opportunities", href: "/crm/opportunities", icon: Briefcase, permission: "crm.opportunity.view" },
      { label: "Pipeline", href: "/crm/pipeline", icon: KanbanSquare, permission: "crm.opportunity.view" },
      { label: "Activities", href: "/crm/activities", icon: PhoneCall, permission: "crm.activity.view" },
    ],
  },
  {
    label: "Products",
    icon: Package,
    module: "products",
    links: [
      { label: "Products", href: "/products/items", icon: Package, permission: "products.product.view" },
      { label: "Categories", href: "/products/categories", icon: FolderTree, permission: "products.category.view" },
      { label: "Units", href: "/products/uoms", icon: Ruler, permission: "products.uom.view" },
      { label: "Price lists", href: "/products/price-lists", icon: Tags, permission: "products.priceList.view" },
      { label: "Discount rules", href: "/products/discounts", icon: Percent, permission: "products.discountRule.view" },
    ],
  },
  {
    label: "Organisation",
    icon: Network,
    module: "org",
    links: [
      { label: "Branches", href: "/org/branches", icon: Building2, permission: "org.branch.view" },
      { label: "Departments", href: "/org/departments", icon: GitBranch, permission: "org.department.view" },
      { label: "Teams", href: "/org/teams", icon: Users, permission: "org.team.view" },
      { label: "Cost centres", href: "/org/cost-centres", icon: PieChart, permission: "org.costCentre.view" },
      { label: "Business units", href: "/org/business-units", icon: Briefcase, permission: "org.businessUnit.view" },
      { label: "Fiscal years", href: "/org/fiscal-years", icon: CalendarRange, permission: "org.fiscalYear.view" },
      { label: "Exchange rates", href: "/org/exchange-rates", icon: Coins, permission: "org.exchangeRate.view" },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    links: [
      { label: "Companies", href: "/settings/companies", icon: Building2 },
      { label: "Users", href: "/settings/users", icon: Users, permission: "platform.user.view" },
      { label: "Modules", href: "/settings/modules", icon: Boxes, adminOnly: true },
      { label: "Approval workflows", href: "/settings/workflows", icon: Workflow, permission: "workflow.definition.view" },
      { label: "Security", href: "/settings/security", icon: ShieldCheck },
      { label: "My delegations", href: "/settings/delegations", icon: UserCheck },
      { label: "Custom fields", href: "/settings/custom-fields", icon: SlidersHorizontal, permission: "platform.customField.view" },
      { label: "System", href: "/settings/system", icon: Layers, adminOnly: true },
    ],
  },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const { can, context, moduleEnabled } = useWorkspace();
  const modules = useQuery({ queryKey: ["modules"], queryFn: platformApi.modules, staleTime: 5 * 60_000 });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const allowed = (l: NavLink) => (l.adminOnly ? !!context?.allPermissions : !l.permission || can(l.permission));
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const comingSoon = (modules.data ?? []).filter((m) => !m.available);

  const link = (l: NavLink, nested = false) => (
    <Link
      key={l.href}
      href={l.href}
      onClick={onNavigate}
      className={clsx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        nested && "pl-9",
        isActive(l.href) ? "bg-sidebar-active text-white" : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
      )}
    >
      <l.icon size={16} />
      {l.label}
    </Link>
  );

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 z-30 w-64 bg-sidebar-bg flex flex-col transition-transform lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
      aria-label="Main navigation"
    >
      <div className="h-16 flex items-center gap-2 px-5 border-b border-white/10">
        <ClipboardCheck className="text-blue-400" size={22} />
        <span className="text-white font-semibold">STTPS ERP</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {TOP.map((l) => link(l))}
        {SECTIONS.filter((s) => !s.module || moduleEnabled(s.module)).map((s) => {
          const links = s.links.filter(allowed);
          if (links.length === 0) return null;
          const isCollapsed = collapsed[s.label] ?? !links.some((l) => isActive(l.href));
          return (
            <div key={s.label} className="pt-2">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-sidebar-text hover:text-white"
                onClick={() => setCollapsed({ ...collapsed, [s.label]: !isCollapsed })}
                aria-expanded={!isCollapsed}
              >
                <s.icon size={16} />
                <span className="flex-1 text-left font-medium">{s.label}</span>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              {!isCollapsed && <div className="space-y-0.5">{links.map((l) => link(l, true))}</div>}
            </div>
          );
        })}
        {comingSoon.length > 0 && (
          <div className="pt-4">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Coming soon</p>
            {comingSoon.map((m) => (
              <p key={m.key} className="px-3 py-1 text-xs text-slate-500" title={m.description}>
                {m.name}
              </p>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
