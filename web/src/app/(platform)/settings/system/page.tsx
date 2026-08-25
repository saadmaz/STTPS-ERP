"use client";

import { useAuth } from "@/lib/auth";
import {
  Globe, Clock, Database, Wifi, Server, RefreshCw,
  CheckCircle2, AlertCircle, Info, DollarSign,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const MODULES = [
  { name: "General Ledger", endpoint: "/finance/gl", status: "operational" },
  { name: "Accounts Payable", endpoint: "/finance/ap", status: "operational" },
  { name: "Accounts Receivable", endpoint: "/finance/ar", status: "operational" },
  { name: "Procurement", endpoint: "/procurement", status: "operational" },
  { name: "Inventory", endpoint: "/inventory", status: "operational" },
  { name: "Manufacturing", endpoint: "/manufacturing", status: "operational" },
  { name: "CRM", endpoint: "/crm", status: "operational" },
  { name: "Sales", endpoint: "/sales", status: "operational" },
  { name: "Human Resources", endpoint: "/hr", status: "operational" },
  { name: "Asset Management", endpoint: "/eam", status: "operational" },
  { name: "Field Service", endpoint: "/fsm", status: "operational" },
  { name: "Projects", endpoint: "/projects", status: "operational" },
  { name: "Quality", endpoint: "/quality", status: "operational" },
  { name: "EHS", endpoint: "/ehs", status: "operational" },
];

const INTEGRATIONS = [
  { name: "REST API", description: "Core backend API (NestJS)", status: "connected", icon: Server },
  { name: "Database", description: "PostgreSQL via Prisma ORM", status: "connected", icon: Database },
  { name: "Authentication", description: "JWT + Refresh token flow", status: "connected", icon: Wifi },
];

export default function SystemSettingsPage() {
  const { activeCompany } = useAuth();
  const now = new Date();

  const systemInfo = [
    { label: "Platform Version", value: "0.7.0 (Phase 7)", icon: Info },
    { label: "API Endpoint", value: API_URL, icon: Server },
    {
      label: "Active Company",
      value: activeCompany?.name ?? "None selected",
      icon: Globe,
    },
    {
      label: "Default Currency",
      value: activeCompany?.currency ?? "USD",
      icon: DollarSign,
    },
    {
      label: "Timezone",
      value: activeCompany?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      icon: Clock,
    },
    {
      label: "Server Time",
      value: now.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "medium" }),
      icon: RefreshCw,
    },
  ];

  return (
    <div className="space-y-8">
      {/* System info */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">System Information</h2>
        <div className="card overflow-hidden">
          {systemInfo.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center justify-between px-5 py-3.5 ${
                i < systemInfo.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon size={14} className="text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-600">{item.label}</span>
              </div>
              <span className="text-sm font-medium text-slate-800 font-mono max-w-xs truncate text-right">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Module status */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">Module Status</h2>
          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <CheckCircle2 size={13} />
            All systems operational
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {MODULES.map((mod, i) => (
              <div
                key={mod.name}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < MODULES.length - 1 ? "border-b border-slate-100" : ""
                } ${i % 2 === 0 && i < MODULES.length - 1 ? "sm:border-r" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{mod.name}</p>
                  <p className="text-xs text-slate-400 font-mono">/api/v1{mod.endpoint}</p>
                </div>
                <span className="badge badge-green flex items-center gap-1 flex-shrink-0 ml-4">
                  <CheckCircle2 size={10} />
                  Operational
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {INTEGRATIONS.map((item) => (
            <div key={item.name} className="card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <item.icon size={16} className="text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-400 truncate">{item.description}</p>
              </div>
              <span className="badge badge-green flex-shrink-0">
                Connected
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Info banner */}
      <div className="card p-4 bg-slate-50 border-slate-200">
        <div className="flex items-start gap-2">
          <AlertCircle size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 leading-relaxed">
            System configuration changes are applied at the infrastructure level.
            Contact your platform administrator to modify API endpoints, enable integrations,
            or update environment variables.
          </p>
        </div>
      </div>
    </div>
  );
}
