"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { portalAuthApi, portalErrorMessage, setPortalToken } from "@/lib/portal-api";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await portalAuthApi.login(email, password);
      setPortalToken(result.accessToken);
      router.push("/portal/tickets");
    } catch (err) {
      toast.error(portalErrorMessage(err, "Invalid email or password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-10">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Sign in</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Access your support tickets</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="form-label">Email</label>
            <input className="input-base" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="form-label">Password</label>
            <input className="input-base" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 justify-center">
            {busy && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-6 text-center">
          Lost your setup link? <Link href="/portal/set-password" className="text-blue-600 hover:text-blue-700 font-medium">Set a password</Link> if you have one, otherwise contact us.
        </p>
      </div>
    </div>
  );
}
