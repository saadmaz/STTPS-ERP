"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, rolesApi, type Company } from "@/lib/api";
import { toast } from "sonner";
import { X, Loader2, User, Building2, Shield, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  password: z.string().min(8, "Minimum 8 characters"),
  phone: z.string().optional(),
  isSuperAdmin: z.boolean().default(false),
  companyId: z.string().optional(),
  roleIds: z.array(z.string()).default([]),
});
type FormValues = z.infer<typeof schema>;

type Step = 0 | 1 | 2;

const STEPS = [
  { label: "Basic Info", icon: User },
  { label: "Company", icon: Building2 },
  { label: "Access", icon: Shield },
];

interface Props {
  tenantId: string;
  companies: Company[];
  onClose: () => void;
}

export function InviteUserModal({ tenantId, companies, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-roles", tenantId],
    queryFn: () => rolesApi.list(tenantId),
  });

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { isSuperAdmin: false, roleIds: [] },
  });

  const selectedCompanyId = watch("companyId");
  const selectedRoleIds = watch("roleIds") ?? [];
  const isSuperAdmin = watch("isSuperAdmin");

  const toggleRole = (roleId: string) => {
    const current = selectedRoleIds;
    setValue(
      "roleIds",
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    );
  };

  const onSubmit = async (data: FormValues) => {
    try {
      await usersApi.create(tenantId, data);
      toast.success(`User ${data.email} created`);
      qc.invalidateQueries({ queryKey: ["admin-users", tenantId] });
      qc.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to create user");
    }
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, 2) as Step);
  const prevStep = () => setStep((s) => Math.max(s - 1, 0) as Step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Invite User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center px-6 py-4 border-b border-slate-50 gap-2">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={s.label} className="flex items-center gap-2 flex-1">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors",
                  done ? "bg-green-500 text-white" : active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400"
                )}>
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", active ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
                {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 min-h-[280px]">
            {/* Step 0: Basic Info */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name *</label>
                    <input {...register("firstName")} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
                    {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name *</label>
                    <input {...register("lastName")} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
                  <input {...register("email")} type="email" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password *</label>
                    <input {...register("password")} type="password" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                    <input {...register("phone")} type="tel" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Company */}
            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Assign this user to a company in this organization. You can skip this and assign later.</p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setValue("companyId", undefined)}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-colors",
                      !selectedCompanyId ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                      <X className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 text-sm">No company</p>
                      <p className="text-xs text-slate-400">Assign to a company later</p>
                    </div>
                    {!selectedCompanyId && <Check className="w-4 h-4 text-brand-600 ml-auto" />}
                  </button>
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setValue("companyId", c.id)}
                      className={cn(
                        "flex items-center gap-3 p-3.5 rounded-lg border-2 text-left transition-colors",
                        selectedCompanyId === c.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.code} · {c.currency}</p>
                      </div>
                      {selectedCompanyId === c.id && <Check className="w-4 h-4 text-brand-600 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Access */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Super Admin toggle */}
                <div
                  onClick={() => setValue("isSuperAdmin", !isSuperAdmin)}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors",
                    isSuperAdmin ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isSuperAdmin ? "bg-amber-100" : "bg-slate-100")}>
                    <Shield className={cn("w-5 h-5", isSuperAdmin ? "text-amber-600" : "text-slate-400")} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm">Super Admin</p>
                    <p className="text-xs text-slate-500">Full access to all modules in this organization</p>
                  </div>
                  <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                    isSuperAdmin ? "bg-amber-500 border-amber-500" : "border-slate-300"
                  )}>
                    {isSuperAdmin && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>

                {/* Roles */}
                {!isSuperAdmin && selectedCompanyId && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Assign Roles</p>
                    {roles.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No roles defined yet. Create roles in the Roles tab first.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {roles.map((role) => (
                          <div
                            key={role.id}
                            onClick={() => toggleRole(role.id)}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                              selectedRoleIds.includes(role.id) ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                            )}
                          >
                            <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                              selectedRoleIds.includes(role.id) ? "bg-brand-600 border-brand-600" : "border-slate-300"
                            )}>
                              {selectedRoleIds.includes(role.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{role.name}</p>
                              {role.description && <p className="text-xs text-slate-400">{role.description}</p>}
                              <p className="text-xs text-slate-400 mt-0.5">
                                {role._count?.userRoles ?? 0} users · {role.rolePermissions?.length ?? 0} permissions
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!isSuperAdmin && !selectedCompanyId && (
                  <p className="text-sm text-slate-400 italic">Go back and assign a company to select roles.</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100">
            <button
              type="button"
              onClick={step === 0 ? onClose : prevStep}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < 2 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
              >
                {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating...</> : "Create User"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
