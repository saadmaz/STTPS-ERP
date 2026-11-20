"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, FileText, DollarSign, ShoppingCart, Package, Factory, Users, Truck, Globe, ShieldCheck, HardHat, Wrench, TrendingUp } from "lucide-react";

interface Report {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  category: string;
}

const REPORTS: Report[] = [
  // Finance
  { title: "Profit & Loss", description: "Revenue vs expenses over a selected period", href: "/finance/reports/pl", icon: TrendingUp, category: "Finance" },
  { title: "Balance Sheet", description: "Assets, liabilities and equity snapshot", href: "/finance/reports/balance-sheet", icon: BarChart3, category: "Finance" },
  { title: "Trial Balance", description: "Debit/credit balances for all GL accounts", href: "/finance/trial-balance", icon: FileText, category: "Finance" },
  { title: "AP Aging", description: "Outstanding payables by age bracket", href: "/finance/ap/aging", icon: DollarSign, category: "Finance" },
  { title: "AR Aging", description: "Outstanding receivables by age bracket", href: "/finance/ar/aging", icon: DollarSign, category: "Finance" },

  // Procurement
  { title: "Purchase Orders", description: "All POs with status and supplier breakdown", href: "/procurement/orders", icon: ShoppingCart, category: "Procurement" },
  { title: "Goods Receipts", description: "Inbound deliveries and receipt history", href: "/procurement/receipts", icon: Truck, category: "Procurement" },
  { title: "Supplier List", description: "Active suppliers and contact information", href: "/procurement/suppliers", icon: Users, category: "Procurement" },

  // Inventory
  { title: "Stock Levels", description: "Current on-hand quantity per item & warehouse", href: "/inventory/stock-levels", icon: Package, category: "Inventory" },
  { title: "Stock Movements", description: "All inbound and outbound stock transactions", href: "/inventory/movements", icon: Truck, category: "Inventory" },
  { title: "Stock Count", description: "Physical count records and variance report", href: "/inventory/count", icon: BarChart3, category: "Inventory" },

  // Manufacturing
  { title: "Production Orders", description: "Manufacturing order status and schedule", href: "/manufacturing/orders", icon: Factory, category: "Manufacturing" },
  { title: "Bill of Materials", description: "BOM structure and component requirements", href: "/manufacturing/bom", icon: FileText, category: "Manufacturing" },
  { title: "MRP Report", description: "Material requirements planning output", href: "/manufacturing/mrp", icon: BarChart3, category: "Manufacturing" },

  // HR
  { title: "Employee Directory", description: "All employees with department and status", href: "/hr/employees", icon: Users, category: "Human Resources" },
  { title: "Leave Summary", description: "Leave requests and balances by employee", href: "/hr/leave", icon: FileText, category: "Human Resources" },
  { title: "Payroll Runs", description: "Payroll history and pay-slip summary", href: "/hr/payroll", icon: DollarSign, category: "Human Resources" },

  // Field Service
  { title: "Service Orders", description: "FSM work orders with technician assignments", href: "/fsm/orders", icon: Truck, category: "Field Service" },
  { title: "Technician Utilisation", description: "Active technicians and availability status", href: "/fsm/technicians", icon: Users, category: "Field Service" },

  // Projects
  { title: "Project Tasks", description: "Task backlog across all active projects", href: "/projects/tasks", icon: Globe, category: "Projects" },
  { title: "Timesheets", description: "Logged hours by employee and project", href: "/projects/timesheets", icon: FileText, category: "Projects" },

  // Quality
  { title: "Inspection Log", description: "Quality inspections with pass/fail results", href: "/quality/inspections", icon: ShieldCheck, category: "Quality" },
  { title: "Non-Conformances", description: "Open and closed NCRs by severity", href: "/quality/ncr", icon: FileText, category: "Quality" },
  { title: "Audit Schedule", description: "Planned and completed quality audits", href: "/quality/audits", icon: BarChart3, category: "Quality" },

  // EHS
  { title: "Incident Register", description: "Safety incidents with severity and status", href: "/ehs/incidents", icon: HardHat, category: "EHS" },
  { title: "Risk Register", description: "Risk assessments and mitigation actions", href: "/ehs/risks", icon: ShieldCheck, category: "EHS" },
  { title: "Permits to Work", description: "Active and expired work permits", href: "/ehs/permits", icon: FileText, category: "EHS" },

  // Assets
  { title: "Asset Register", description: "All tracked assets with condition and location", href: "/eam/assets", icon: Wrench, category: "Asset Management" },
  { title: "Work Orders", description: "Maintenance work orders and completion rates", href: "/eam/work-orders", icon: FileText, category: "Asset Management" },
];

const CATEGORIES = [...new Set(REPORTS.map((r) => r.category))];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Finance": DollarSign,
  "Procurement": ShoppingCart,
  "Inventory": Package,
  "Manufacturing": Factory,
  "Human Resources": Users,
  "Field Service": Truck,
  "Projects": Globe,
  "Quality": ShieldCheck,
  "EHS": HardHat,
  "Asset Management": Wrench,
};

export default function ReportsCataloguePage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Report Catalogue</h1>
          <p className="page-subtitle">{REPORTS.length} reports across {CATEGORIES.length} modules</p>
        </div>
        <Link href="/analytics" className="btn-secondary gap-2">
          <BarChart3 size={15} />
          Analytics Overview
        </Link>
      </div>

      <div className="space-y-8">
        {CATEGORIES.map((category) => {
          const CategoryIcon = CATEGORY_ICONS[category] ?? BarChart3;
          const reports = REPORTS.filter((r) => r.category === category);

          return (
            <div key={category}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
                  <CategoryIcon size={13} className="text-slate-600" />
                </div>
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  {category}
                </h2>
                <div className="flex-1 border-t border-slate-200 ml-2" />
                <span className="text-xs text-slate-400">{reports.length} reports</span>
              </div>

              {/* Report cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {reports.map((report) => (
                  <Link
                    key={report.href}
                    href={report.href}
                    className="card p-4 hover:shadow-md transition-shadow group flex items-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:border-blue-200 group-hover:bg-blue-50 transition-colors">
                      <report.icon size={14} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700 transition-colors">
                        {report.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                        {report.description}
                      </p>
                    </div>
                    <ArrowRight size={13} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
