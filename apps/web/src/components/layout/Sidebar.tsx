"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Package,
  Factory,
  Users,
  Wrench,
  Truck,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
  ClipboardList,
  FileText,
  CreditCard,
  Receipt,
  Banknote,
  Briefcase,
  ShieldCheck,
  Globe,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  children?: NavItem[];
  badge?: string;
}

const navigation: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Finance",
    icon: DollarSign,
    children: [
      { label: "Overview", href: "/finance", icon: BarChart3 },
      { label: "Chart of Accounts", href: "/finance/accounts", icon: ClipboardList },
      { label: "Journal Entries", href: "/finance/journals", icon: FileText },
      { label: "Trial Balance", href: "/finance/trial-balance", icon: BarChart3 },
      { label: "Accounts Payable", href: "/finance/ap", icon: CreditCard },
      { label: "Accounts Receivable", href: "/finance/ar", icon: Receipt },
      { label: "Cash & Bank", href: "/finance/bank", icon: Banknote },
      { label: "Fixed Assets", href: "/finance/assets", icon: Building2 },
      { label: "Budgets", href: "/finance/budgets", icon: DollarSign },
      { label: "P&L Report", href: "/finance/reports/pl", icon: BarChart3 },
      { label: "Balance Sheet", href: "/finance/reports/balance-sheet", icon: BarChart3 },
      { label: "Fiscal Periods", href: "/finance/periods", icon: ClipboardList },
    ],
  },
  {
    label: "Procurement",
    icon: ShoppingCart,
    children: [
      { label: "Overview", href: "/procurement", icon: BarChart3 },
      { label: "Requisitions", href: "/procurement/requisitions", icon: ClipboardList },
      { label: "Purchase Orders", href: "/procurement/orders", icon: ShoppingCart },
      { label: "Goods Receipts", href: "/procurement/receipts", icon: Truck },
      { label: "Suppliers", href: "/procurement/suppliers", icon: Truck },
    ],
  },
  {
    label: "Inventory",
    icon: Package,
    children: [
      { label: "Overview", href: "/inventory", icon: BarChart3 },
      { label: "Items", href: "/inventory/items", icon: Package },
      { label: "Warehouses", href: "/inventory/warehouses", icon: Building2 },
      { label: "Stock Levels", href: "/inventory/stock-levels", icon: ClipboardList },
      { label: "Stock Movements", href: "/inventory/movements", icon: Truck },
      { label: "Stock Count", href: "/inventory/count", icon: ClipboardList },
    ],
  },
  {
    label: "Manufacturing",
    icon: Factory,
    children: [
      { label: "Overview", href: "/manufacturing", icon: BarChart3 },
      { label: "Production Orders", href: "/manufacturing/orders", icon: Factory },
      { label: "Bill of Materials", href: "/manufacturing/bom", icon: ClipboardList },
      { label: "Work Centers", href: "/manufacturing/work-centers", icon: Settings },
      { label: "Routings", href: "/manufacturing/routings", icon: ClipboardList },
      { label: "MRP", href: "/manufacturing/mrp", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    icon: Users,
    children: [
      { label: "Overview", href: "/crm", icon: BarChart3 },
      { label: "Leads", href: "/crm/leads", icon: Users },
      { label: "Opportunities", href: "/crm/opportunities", icon: BarChart3 },
      { label: "Accounts", href: "/crm/accounts", icon: Building2 },
      { label: "Contacts", href: "/crm/contacts", icon: Users },
      { label: "Activities", href: "/crm/activities", icon: ClipboardList },
    ],
  },
  {
    label: "Sales",
    icon: Briefcase,
    children: [
      { label: "Overview", href: "/sales", icon: BarChart3 },
      { label: "Quotations", href: "/sales/quotes", icon: FileText },
      { label: "Sales Orders", href: "/sales/orders", icon: ClipboardList },
      { label: "Deliveries", href: "/sales/deliveries", icon: Truck },
      { label: "Price Lists", href: "/sales/price-lists", icon: DollarSign },
    ],
  },
  {
    label: "Human Resources",
    icon: Users,
    children: [
      { label: "Employees", href: "/hr/employees", icon: Users },
      { label: "Payroll", href: "/hr/payroll", icon: Banknote },
      { label: "Leave", href: "/hr/leave", icon: ClipboardList },
      { label: "Recruitment", href: "/hr/recruitment", icon: Briefcase },
    ],
  },
  {
    label: "Asset Management",
    icon: Wrench,
    children: [
      { label: "Assets", href: "/eam/assets", icon: Building2 },
      { label: "Work Orders", href: "/eam/work-orders", icon: ClipboardList },
      { label: "Maintenance Plans", href: "/eam/plans", icon: Settings },
    ],
  },
  {
    label: "Field Service",
    icon: Truck,
    children: [
      { label: "Service Orders", href: "/fsm/orders", icon: ClipboardList },
      { label: "Technicians", href: "/fsm/technicians", icon: Users },
      { label: "Contracts", href: "/fsm/contracts", icon: FileText },
    ],
  },
  {
    label: "Projects",
    icon: Globe,
    children: [
      { label: "All Projects", href: "/projects", icon: Globe },
      { label: "Tasks", href: "/projects/tasks", icon: ClipboardList },
      { label: "Timesheets", href: "/projects/timesheets", icon: FileText },
    ],
  },
  {
    label: "Quality",
    icon: ShieldCheck,
    children: [
      { label: "Inspections", href: "/quality/inspections", icon: ClipboardList },
      { label: "Non-Conformances", href: "/quality/ncr", icon: ShieldCheck },
      { label: "Audits", href: "/quality/audits", icon: FileText },
    ],
  },
  {
    label: "Analytics",
    icon: BarChart3,
    children: [
      { label: "Dashboards", href: "/analytics", icon: BarChart3 },
      { label: "Reports", href: "/analytics/reports", icon: FileText },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    children: [
      { label: "Companies", href: "/settings/companies", icon: Building2 },
      { label: "Users & Roles", href: "/settings/users", icon: Users },
      { label: "System", href: "/settings/system", icon: Settings },
    ],
  },
];

function NavItemComponent({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname();
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + "/") : false;
  const hasChildren = item.children && item.children.length > 0;

  const isParentActive = hasChildren
    ? item.children!.some(
        (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + "/")),
      )
    : false;

  const [isOpen, setIsOpen] = useState(isParentActive || isActive);

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
            isParentActive
              ? "text-white bg-blue-600/20"
              : "text-slate-400 hover:text-white hover:bg-slate-800",
          )}
        >
          <item.icon size={16} className="flex-shrink-0" />
          <span className="flex-1 text-left font-medium">{item.label}</span>
          {isOpen ? (
            <ChevronDown size={14} className="text-slate-500" />
          ) : (
            <ChevronRight size={14} className="text-slate-500" />
          )}
        </button>
        {isOpen && (
          <div className="mt-0.5 ml-2 pl-3 border-l border-slate-700/60 space-y-0.5">
            {item.children!.map((child) => (
              <NavItemComponent key={child.href || child.label} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href!}
      className={clsx(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
        isActive
          ? "text-white bg-blue-600 font-medium"
          : "text-slate-400 hover:text-white hover:bg-slate-800",
      )}
    >
      <item.icon size={15} className="flex-shrink-0" />
      <span>{item.label}</span>
      {item.badge && (
        <span className="ml-auto text-xs bg-blue-500 text-white rounded-full px-1.5 py-0.5">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="w-60 bg-slate-900 h-screen flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-slate-800">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <div>
          <span className="text-white font-bold text-base tracking-tight">STTPS</span>
          <p className="text-slate-500 text-xs leading-none">Enterprise ERP</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navigation.map((item) => (
          <NavItemComponent key={item.href || item.label} item={item} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-800 p-3">
        <p className="text-xs text-slate-600 text-center">v0.1.0 — Phase 0</p>
      </div>
    </aside>
  );
}
