"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { portalAuthApi, portalErrorMessage } from "@/lib/portal-api";

export default function PortalSetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await portalAuthApi.setPassword(token, password);
      toast.success("Password set — sign in to continue");
      router.push("/portal/login");
    } catch (err) {
      toast.error(portalErrorMessage(err, "This link is not valid or has expired"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-10">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Set your password</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Use this to set up your login, or to reset a forgotten password.</p>
        {!token ? (
          <p className="text-sm text-red-600">This page needs a setup link. Check the link you were given.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="form-label">New password</label>
              <input className="input-base" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <p className="text-xs text-slate-500 mt-1">At least 10 characters, with a letter and a digit.</p>
            </div>
            <div>
              <label className="form-label">Confirm password</label>
              <input className="input-base" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5 justify-center">
              {busy && <Loader2 size={16} className="animate-spin" />}
              Set password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
