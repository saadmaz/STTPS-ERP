"use client";

import { useQuery } from "@tanstack/react-query";
import { companiesApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Building2, MapPin, DollarSign, Globe, CheckCircle2 } from "lucide-react";
import { PageLoader } from "@/components/ui/PageLoader";
import { clsx } from "clsx";

export default function CompaniesSettingsPage() {
  const { activeCompany } = useAuth();

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: () => companiesApi.list(),
  });

  const list = companies ?? [];

  return (
    <div>
      {/* Section title */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Companies</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            All companies registered in your organisation
          </p>
        </div>
        <span className="badge badge-slate">{list.length} companies</span>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : list.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 size={36} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">No companies found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((company: any) => {
            const isActive = company.id === activeCompany?.id;
            return (
              <div
                key={company.id}
                className={clsx(
                  "card p-5 transition-shadow",
                  isActive ? "ring-2 ring-blue-500" : "hover:shadow-md",
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-sm">
                        {company.name?.charAt(0)?.toUpperCase() ?? "C"}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 leading-tight">
                        {company.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">{company.code ?? company.slug ?? "—"}</p>
                    </div>
                  </div>
                  {isActive && (
                    <span className="flex items-center gap-1 badge badge-green text-xs">
                      <CheckCircle2 size={11} />
                      Active
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-2">
                  {company.legalName && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Building2 size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate">{company.legalName}</span>
                    </div>
                  )}
                  {company.country && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                      <span>{company.country}{company.city ? `, ${company.city}` : ""}</span>
                    </div>
                  )}
                  {company.currency && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <DollarSign size={12} className="text-slate-400 flex-shrink-0" />
                      <span>{company.currency} — {company.timezone ?? "UTC"}</span>
                    </div>
                  )}
                  {company.website && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Globe size={12} className="text-slate-400 flex-shrink-0" />
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-blue-600 hover:underline"
                      >
                        {company.website}
                      </a>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span
                    className={clsx(
                      "badge",
                      company.isActive !== false ? "badge-green" : "badge-red",
                    )}
                  >
                    {company.isActive !== false ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs text-slate-400 font-mono truncate max-w-[120px]">
                    {company.id?.slice(0, 8)}…
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info banner */}
      <div className="mt-6 card p-4 bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Note:</strong> Company creation and configuration is managed by your platform administrator.
          Switch your active company using the company selector in the top navigation bar.
        </p>
      </div>
    </div>
  );
}


