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
  Calendar,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CalendarClock,
  CalendarDays,
  CalendarHeart,
  Clock,
  FolderKanban,
  GraduationCap,
  HandCoins,
  Headset,
  Inbox,
  KeyRound,
  Laptop,
  ListTodo,
  Milestone,
  Palmtree,
  Repeat,
  RotateCw,
  Tablet,
  Timer,
  TrendingUp,
  UserCircle,
  Wallet,
  Wrench,
  BookOpen,
  Receipt,
  Banknote,
  Calculator,
  FileSpreadsheet,
  Landmark,
  Scale,
  TriangleAlert,
  ClipboardList,
  Factory,
  FileQuestion,
  PackageCheck,
  ShoppingBag,
  Coins,
  FileText,
  RotateCcw,
  ShoppingCart,
  Truck,
  Warehouse,
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
  Megaphone,
  Network,
  PieChart,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
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
    label: "Sales",
    icon: ShoppingCart,
    module: "sales",
    links: [
      { label: "Quotes", href: "/sales/quotes", icon: FileText, permission: "sales.quote.view" },
      { label: "Orders", href: "/sales/orders", icon: ShoppingCart, permission: "sales.order.view" },
      { label: "Deliveries", href: "/sales/deliveries", icon: Truck, permission: "sales.delivery.view" },
      { label: "Returns", href: "/sales/returns", icon: RotateCcw, permission: "sales.return.view" },
      { label: "Sales settings", href: "/sales/settings", icon: SlidersHorizontal, permission: "sales.settings.edit" },
    ],
  },
  {
    label: "Finance",
    icon: Landmark,
    module: "finance",
    links: [
      { label: "Overview", href: "/finance", icon: PieChart, permission: "finance.account.view" },
      { label: "Invoices", href: "/finance/invoices", icon: FileText, permission: "finance.invoice.view" },
      { label: "Customer receipts", href: "/finance/receipts", icon: Coins, permission: "finance.receipt.view" },
      { label: "Receivables ageing", href: "/finance/receivables", icon: CalendarRange, permission: "finance.invoice.view" },
      { label: "Recurring invoices", href: "/finance/recurring-invoices", icon: CalendarRange, permission: "finance.invoice.view" },
      { label: "Supplier bills", href: "/finance/bills", icon: ClipboardList, permission: "finance.bill.view" },
      { label: "Supplier payments", href: "/finance/payments", icon: Banknote, permission: "finance.payment.view" },
      { label: "Payables ageing", href: "/finance/payables", icon: CalendarRange, permission: "finance.bill.view" },
      { label: "Bank and cash", href: "/finance/bank", icon: Landmark, permission: "finance.bank.view" },
      { label: "Journals", href: "/finance/journals", icon: BookOpen, permission: "finance.journal.view" },
      { label: "Budgets", href: "/finance/budgets", icon: Target, permission: "finance.budget.view" },
      { label: "Chart of accounts", href: "/finance/accounts", icon: FolderTree, permission: "finance.account.view" },
      { label: "Trial balance", href: "/finance/reports/trial-balance", icon: Scale, permission: "finance.reports.view" },
      { label: "Profit and loss", href: "/finance/reports/profit-and-loss", icon: FileSpreadsheet, permission: "finance.reports.view" },
      { label: "Balance sheet", href: "/finance/reports/balance-sheet", icon: Calculator, permission: "finance.reports.view" },
      { label: "Cash flow", href: "/finance/reports/cash-flow", icon: Coins, permission: "finance.reports.view" },
      { label: "Tax return", href: "/finance/reports/tax", icon: Percent, permission: "finance.reports.view" },
      { label: "Recurring journals", href: "/finance/recurring", icon: CalendarRange, permission: "finance.journal.view" },
      { label: "Posting issues", href: "/finance/issues", icon: TriangleAlert, permission: "finance.journal.view" },
      { label: "Posting rules", href: "/finance/settings", icon: SlidersHorizontal, permission: "finance.settings.edit" },
    ],
  },
  {
    label: "Assets",
    icon: Building2,
    module: "assets",
    links: [
      { label: "Register", href: "/assets/register", icon: Boxes, permission: "assets.asset.view" },
      { label: "Depreciation run", href: "/assets/depreciation", icon: CalendarRange, permission: "assets.asset.edit" },
      { label: "Categories", href: "/assets/categories", icon: Tags, permission: "assets.category.view" },
      { label: "Audits", href: "/assets/audits", icon: ClipboardCheck, permission: "assets.audit.view" },
      { label: "Repairs", href: "/assets/repairs", icon: Wrench, permission: "assets.repair.view" },
    ],
  },
  {
    label: "Maintenance",
    icon: Wrench,
    module: "maintenance",
    links: [
      { label: "Work orders", href: "/maintenance/work-orders", icon: Wrench, permission: "maintenance.workOrder.view" },
      { label: "Plans", href: "/maintenance/plans", icon: CalendarClock, permission: "maintenance.plan.view" },
    ],
  },
  {
    label: "Support",
    icon: Headset,
    module: "support",
    links: [
      { label: "Tickets", href: "/support/tickets", icon: Headset, permission: "support.ticket.view" },
      { label: "SLA policies", href: "/support/sla-policies", icon: ClipboardList, permission: "support.slaPolicy.view" },
      { label: "Portal logins", href: "/support/portal-users", icon: KeyRound, permission: "support.portalUser.view" },
    ],
  },
  {
    label: "Expenses",
    icon: Receipt,
    module: "expenses",
    links: [
      { label: "Expense claims", href: "/expenses/claims", icon: Receipt, permission: "expenses.claim.view" },
      { label: "Categories", href: "/expenses/categories", icon: Tags, permission: "expenses.category.view" },
    ],
  },
  {
    label: "HR & People",
    icon: Users,
    module: "hr",
    links: [
      { label: "Employees", href: "/hr/employees", icon: Users, permission: "hr.employee.view" },
      { label: "Org chart", href: "/hr/org-chart", icon: Network, permission: "hr.employee.view" },
      { label: "Positions", href: "/hr/positions", icon: Briefcase, permission: "hr.position.view" },
      { label: "Job grades", href: "/hr/job-grades", icon: Layers, permission: "hr.jobGrade.view" },
      { label: "Job requisitions", href: "/hr/requisitions", icon: ClipboardList, permission: "hr.jobRequisition.view" },
      { label: "Job postings", href: "/hr/postings", icon: Megaphone, permission: "hr.jobPosting.view" },
      { label: "Candidates", href: "/hr/candidates", icon: UserPlus, permission: "hr.candidate.view" },
      { label: "Onboarding & offboarding", href: "/hr/checklists", icon: ClipboardCheck, permission: "hr.checklist.view" },
      { label: "My Attendance", href: "/hr/attendance", icon: Timer },
      { label: "Attendance", href: "/hr/attendance-records", icon: Clock, permission: "hr.attendanceRecord.view" },
      { label: "Timesheet", href: "/hr/timesheet", icon: CalendarClock, permission: "hr.attendanceRecord.view" },
      { label: "Attendance devices", href: "/hr/devices", icon: Tablet, permission: "hr.device.view" },
      { label: "Attendance settings", href: "/hr/attendance-settings", icon: Settings, permission: "hr.attendanceRecord.edit" },
      { label: "My Shifts", href: "/hr/my-shifts", icon: Repeat },
      { label: "Shift calendar", href: "/hr/shift-calendar", icon: CalendarDays, permission: "hr.shiftAssignment.view" },
      { label: "Shift templates", href: "/hr/shift-templates", icon: CalendarClock, permission: "hr.shiftTemplate.view" },
      { label: "Shift assignments", href: "/hr/shift-assignments", icon: CalendarClock, permission: "hr.shiftAssignment.view" },
      { label: "My Leave", href: "/hr/my-leave", icon: Palmtree },
      { label: "Leave calendar", href: "/hr/leave-calendar", icon: CalendarHeart, permission: "hr.leaveRequest.view" },
      { label: "Leave requests", href: "/hr/leave-requests", icon: CalendarDays, permission: "hr.leaveRequest.view" },
      { label: "Leave policies", href: "/hr/leave-policies", icon: Palmtree, permission: "hr.leavePolicy.view" },
      { label: "Holidays", href: "/hr/holidays", icon: CalendarHeart, permission: "hr.holiday.view" },
      { label: "Leave rollover", href: "/hr/leave-rollover", icon: RotateCw, permission: "hr.leavePolicy.edit" },
      { label: "My Performance", href: "/hr/my-performance", icon: TrendingUp },
      { label: "Performance cycles", href: "/hr/performance-cycles", icon: TrendingUp, permission: "hr.performanceCycle.view" },
      { label: "Goals", href: "/hr/goals", icon: Target, permission: "hr.goal.view" },
      { label: "Reviews", href: "/hr/reviews", icon: ClipboardCheck, permission: "hr.review.view" },
      { label: "Development plans", href: "/hr/development-plans", icon: GraduationCap, permission: "hr.developmentPlan.view" },
      { label: "My HR", href: "/hr/my-hr", icon: UserCircle },
      { label: "Announcements", href: "/hr/announcements", icon: Megaphone, permission: "hr.announcement.view" },
      { label: "HR requests", href: "/hr/requests", icon: Inbox, permission: "hr.hrRequest.view" },
      { label: "Equipment requests", href: "/hr/equipment-requests", icon: Laptop, permission: "hr.equipmentRequest.view" },
      { label: "My Payslips", href: "/hr/my-payslips", icon: Wallet },
      { label: "Payroll runs", href: "/hr/payroll-runs", icon: Wallet, permission: "hr.payrollRun.view" },
      { label: "Salary structures", href: "/hr/salary-structures", icon: HandCoins, permission: "hr.salaryStructure.view" },
      { label: "Salary components", href: "/hr/salary-components", icon: HandCoins, permission: "hr.salaryComponent.view" },
      { label: "Loans and advances", href: "/hr/loans", icon: HandCoins, permission: "hr.loan.view" },
      { label: "Statutory rates", href: "/hr/statutory-rates", icon: Receipt, permission: "hr.statutoryRate.view" },
      { label: "APIT brackets", href: "/hr/apit-brackets", icon: Receipt, permission: "hr.apitBracket.view" },
    ],
  },
  {
    label: "Calendar",
    icon: Calendar,
    module: "calendar",
    links: [
      { label: "My Calendar", href: "/calendar", icon: Calendar },
      { label: "Company Calendar", href: "/calendar/company", icon: Calendar, permission: "calendar.event.view" },
      { label: "Events", href: "/calendar/events", icon: Calendar, permission: "calendar.event.view" },
    ],
  },
  {
    label: "Projects & Tasks",
    icon: FolderKanban,
    module: "projects",
    links: [
      { label: "My Tasks", href: "/tasks", icon: ListTodo },
      { label: "My Timesheet", href: "/tasks/timesheet", icon: Clock },
      { label: "All tasks", href: "/tasks/all", icon: ListTodo, permission: "tasks.allTasks.view" },
      { label: "Projects", href: "/projects/all", icon: FolderKanban, permission: "projects.project.view" },
      { label: "Phases", href: "/projects/phases-list", icon: Layers, permission: "projects.phase.view" },
      { label: "Milestones", href: "/projects/milestones-list", icon: Milestone, permission: "projects.milestone.view" },
      { label: "Project costs", href: "/projects/costs-list", icon: Receipt, permission: "projects.projectCost.view" },
    ],
  },
  {
    label: "Procurement",
    icon: ShoppingBag,
    module: "procurement",
    links: [
      { label: "Overview", href: "/procurement", icon: PieChart, permission: "procurement.analytics.view" },
      { label: "Requisitions", href: "/procurement/requisitions", icon: ClipboardList, permission: "procurement.requisition.view" },
      { label: "RFQs", href: "/procurement/rfqs", icon: FileQuestion, permission: "procurement.rfq.view" },
      { label: "Purchase orders", href: "/procurement/orders", icon: ShoppingBag, permission: "procurement.order.view" },
      { label: "Goods receipts", href: "/procurement/receipts", icon: PackageCheck, permission: "procurement.receipt.view" },
      { label: "Supplier returns", href: "/procurement/returns", icon: RotateCcw, permission: "procurement.receipt.view" },
      { label: "Suppliers", href: "/procurement/suppliers", icon: Factory, permission: "procurement.supplier.view" },
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
    label: "Inventory",
    icon: Warehouse,
    module: "inventory",
    links: [
      { label: "Stock", href: "/inventory/stock", icon: Boxes, permission: "inventory.stock.view" },
      { label: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal, permission: "inventory.adjustment.view" },
      { label: "Transfers", href: "/inventory/transfers", icon: Truck, permission: "inventory.transfer.view" },
      { label: "Stock counts", href: "/inventory/counts", icon: ClipboardCheck, permission: "inventory.count.view" },
      { label: "Warehouses", href: "/inventory/warehouses", icon: Warehouse, permission: "inventory.warehouse.view" },
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
