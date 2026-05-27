"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const registerSchema = z.object({
  organizationName: z.string().min(2, "Organization name required"),
  organizationSlug: z
    .string()
    .min(2, "Slug required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, hyphens only"),
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  // Redirect already-authenticated users away from the register page
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const orgName = watch("organizationName");

  const handleOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValue("organizationName", value);
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 32);
    setValue("organizationSlug", slug);
  };

  const onSubmit = async (data: RegisterForm) => {
    try {
      await authApi.register(data);
      toast.success("Account created! Please sign in.");
      router.push("/login");
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to create account";
      toast.error(Array.isArray(message) ? message.join(", ") : message);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="text-sm text-slate-500 mt-1">Start your free STTPS workspace</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">First name *</label>
            <input {...register("firstName")} className="input-base" placeholder="John" />
            {errors.firstName && <p className="form-error">{errors.firstName.message}</p>}
          </div>
          <div>
            <label className="form-label">Last name *</label>
            <input {...register("lastName")} className="input-base" placeholder="Smith" />
            {errors.lastName && <p className="form-error">{errors.lastName.message}</p>}
          </div>
        </div>

        <div>
          <label className="form-label">Work email *</label>
          <input
            {...register("email")}
            type="email"
            className="input-base"
            placeholder="john@company.com"
            autoComplete="email"
          />
          {errors.email && <p className="form-error">{errors.email.message}</p>}
        </div>

        <div>
          <label className="form-label">Organization name *</label>
          <input
            value={orgName || ""}
            onChange={handleOrgNameChange}
            className="input-base"
            placeholder="Acme Corporation"
          />
          {errors.organizationName && <p className="form-error">{errors.organizationName.message}</p>}
        </div>

        <div>
          <label className="form-label">Organization slug *</label>
          <div className="flex items-center input-base p-0 overflow-hidden">
            <span className="px-3 py-2 text-slate-400 text-sm bg-slate-50 border-r border-slate-200">
              sttps.live/
            </span>
            <input
              {...register("organizationSlug")}
              className="flex-1 px-3 py-2 text-sm outline-none"
              placeholder="acme-corp"
            />
          </div>
          {errors.organizationSlug && <p className="form-error">{errors.organizationSlug.message}</p>}
        </div>

        <div>
          <label className="form-label">Company name (optional)</label>
          <input {...register("companyName")} className="input-base" placeholder="Acme Inc." />
        </div>

        <div>
          <label className="form-label">Password *</label>
          <div className="relative">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              className="input-base pr-10"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="form-error">{errors.password.message}</p>}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center">
        <p className="text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
