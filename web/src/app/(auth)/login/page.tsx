"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Validate the ?next= param to prevent open-redirect attacks. */
function getSafeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Must be an internal absolute path (starts with /) and not a protocol-relative URL (//)
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    return raw;
  }
  return "/dashboard";
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  // Redirect already-authenticated users away from the login page
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(getSafeNext(searchParams.get("next")));
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "admin@demo.sttps.live", password: "Admin@123" },
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.email, data.password);
      // Set session cookie so middleware knows user is logged in
      document.cookie = "sttps_session=1; path=/; max-age=2592000; SameSite=Lax";
      router.push(getSafeNext(searchParams.get("next")));
      toast.success("Welcome back!");
    } catch (err: any) {
      const message = err?.response?.data?.message || "Invalid email or password";
      toast.error(message);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-500 mt-1">Access your ERP workspace</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="form-label">Email address</label>
          <input
            {...register("email")}
            type="email"
            className="input-base"
            placeholder="you@company.com"
            autoComplete="email"
          />
          {errors.email && <p className="form-error">{errors.email.message}</p>}
        </div>

        <div>
          <label className="form-label">Password</label>
          <div className="relative">
            <input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              className="input-base pr-10"
              placeholder="••••••••"
              autoComplete="current-password"
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
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 space-y-2 text-center">
        <p className="text-xs text-slate-500">Demo credentials are pre-filled above</p>
        <p className="text-sm text-slate-500">
          New to STTPS?{" "}
          <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">Create account</Link>
        </p>
      </div>
    </div>
  );
}
