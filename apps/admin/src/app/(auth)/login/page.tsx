"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      const next = searchParams.get("next") || "/dashboard";
      router.replace(next);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      toast.error(msg === "Not a platform admin" ? "Access denied: platform admin only" : "Invalid credentials");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0a1a] to-[#1a0a2e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg shadow-brand-900/50">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">STTPS Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Platform Administration Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="admin@sttps.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in...</> : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            Restricted to STTPS platform administrators only
          </p>
        </div>
      </div>
    </div>
  );
}
