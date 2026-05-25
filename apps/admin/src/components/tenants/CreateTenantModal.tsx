"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { tenantsApi } from "@/lib/api";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { slugify } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Name required"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and dashes only"),
  companyName: z.string().optional(),
  plan: z.string().default("starter"),
  currency: z.string().default("USD"),
  timezone: z.string().default("UTC"),
});
type FormValues = z.infer<typeof schema>;

interface Props { open: boolean; onClose: () => void; }

const PLANS = ["starter", "professional", "enterprise"];

export function CreateTenantModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { plan: "starter", currency: "USD", timezone: "UTC" },
  });

  const nameValue = watch("name");

  const onSubmit = async (data: FormValues) => {
    try {
      await tenantsApi.create(data);
      toast.success(`Organization "${data.name}" created`);
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to create organization");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">New Organization</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Organization Name *</label>
              <input
                {...register("name", {
                  onChange: (e) => setValue("slug", slugify(e.target.value)),
                })}
                placeholder="Acme Corporation"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Slug *</label>
              <div className="flex items-center gap-0">
                <span className="px-3 py-2 bg-slate-50 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500">sttps.com/</span>
                <input
                  {...register("slug")}
                  placeholder="acme-corp"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">First Company Name</label>
              <input
                {...register("companyName")}
                placeholder={nameValue || "Same as org name"}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Plan</label>
              <select
                {...register("plan")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Base Currency</label>
              <select
                {...register("currency")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {["USD","EUR","GBP","AED","SAR","PKR","INR"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Timezone</label>
              <select
                {...register("timezone")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {["UTC","America/New_York","America/Los_Angeles","Europe/London","Asia/Dubai","Asia/Karachi","Asia/Kolkata"].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating...</> : "Create Organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
