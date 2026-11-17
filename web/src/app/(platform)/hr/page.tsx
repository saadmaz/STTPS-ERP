"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Users, Calendar, UserPlus } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import Link from "next/link";

export default function HROverviewPage() {
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["hr-dashboard", activeCompany?.id],
    queryFn: () => hrApi.dashboard(),
    enabled: !!activeCompany,
  });

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  const cards = [
    { label: "Total Employees", value: data?.totalEmployees ?? 0, sub: `${data?.activeEmployees ?? 0} active`, icon: Users, color: "text-blue-600", bg: "bg-blue-50", href: "/hr/employees" },
    { label: "Pending Leave", value: data?.openLeave ?? 0, sub: "awaiting approval", icon: Calendar, color: "text-orange-600", bg: "bg-orange-50", href: "/hr/leave" },
    { label: "Open Job Postings", value: data?.openJobPostings ?? 0, sub: "positions open", icon: UserPlus, color: "text-emerald-600", bg: "bg-emerald-50", href: "/hr/recruitment" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Human Resources</h1>
          <p className="page-subtitle">Workforce overview for {activeCompany?.name}</p>
        </div>
        <Link href="/hr/employees" className="btn-primary">
          <Users size={16} /> Manage Employees
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} mb-3`}>
              <c.icon size={20} className={c.color} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm font-medium text-slate-700 mt-1">{c.label}</p>
            <p className="text-xs text-slate-400">{c.sub}</p>
          </Link>
        ))}
      </div>

      {/* Pending Leave Requests */}
      {data?.pendingLeave?.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Pending Leave Requests</h2>
          <div className="space-y-2">
            {data.pendingLeave.map((req: any) => (
              <div key={req.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {req.employee.firstName} {req.employee.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {req.leaveType.name} — {req.days} day{req.days !== 1 ? "s" : ""}
                  </p>
                </div>
                <Link href="/hr/leave" className="btn-secondary text-xs">Review</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


