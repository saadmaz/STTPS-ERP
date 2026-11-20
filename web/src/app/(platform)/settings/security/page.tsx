"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { authApi, errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Field, PageHeader, Spinner } from "@/components/ui/kit";

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => {
      toast.success("Password changed. Other devices were signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const mismatch = confirm.length > 0 && confirm !== next;
  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-4">Password</h2>
      <form
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch) change.mutate();
        }}
      >
        <Field label="Current password">
          <input className="input-base" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" hint="10+ characters with a letter and a digit">
          <input className="input-base" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
        </Field>
        <Field label="Repeat new password" error={mismatch ? "Does not match" : undefined}>
          <input className="input-base" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <div className="sm:col-span-3 flex justify-end">
          <button className="btn-primary" disabled={change.isPending || mismatch}>
            Change password
          </button>
        </div>
      </form>
    </section>
  );
}

function MfaCard() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: authApi.me });
  const enabled = profile.data?.mfaEnabled === true;
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const start = useMutation({ mutationFn: authApi.mfaSetup, onSuccess: setSetup, onError: (e) => toast.error(errorMessage(e)) });
  const enable = useMutation({
    mutationFn: () => authApi.mfaEnable(code),
    onSuccess: (res) => {
      setRecovery(res.recoveryCodes);
      setSetup(null);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: () => authApi.mfaDisable(code),
    onSuccess: () => {
      toast.success("Two-step sign-in is off");
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section className="card p-5">
      <h2 className="font-semibold flex items-center gap-2">
        <ShieldCheck size={18} className={enabled ? "text-green-600" : "text-slate-400"} />
        Two-step sign-in {enabled ? <span className="badge-green">On</span> : <span className="badge-slate">Off</span>}
      </h2>
      <p className="text-sm text-slate-500 mt-1">Ask for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password …) after your password.</p>

      {recovery && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm font-medium">Save these recovery codes now. Each works once if you lose your phone; they are not shown again.</p>
          <pre className="mt-2 grid grid-cols-2 gap-1 text-sm font-mono">{recovery.join("\n")}</pre>
          <button className="btn-secondary mt-3" onClick={() => setRecovery(null)}>
            I have saved them
          </button>
        </div>
      )}

      {profile.isLoading ? (
        <Spinner />
      ) : enabled ? (
        <form
          className="mt-4 flex flex-wrap gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            disable.mutate();
          }}
        >
          <Field label="Code to turn it off">
            <input className="input-base w-48" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
          </Field>
          <button className="btn-danger" disabled={disable.isPending || code.length < 6}>
            Turn off
          </button>
        </form>
      ) : setup ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enable.mutate();
          }}
        >
          <p className="text-sm">
            In your authenticator app, add an account with this key (or open the{" "}
            <a href={setup.otpauthUrl} className="text-blue-600 underline">
              setup link
            </a>{" "}
            on your phone):
          </p>
          <code className="block p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm break-all select-all">{setup.secret.match(/.{1,4}/g)!.join(" ")}</code>
          <div className="flex flex-wrap gap-2 items-end">
            <Field label="Code from the app">
              <input className="input-base w-48" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            </Field>
            <button className="btn-primary" disabled={enable.isPending || code.length !== 6}>
              Turn on
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-primary mt-4" onClick={() => start.mutate()} disabled={start.isPending}>
          Set up two-step sign-in
        </button>
      )}
    </section>
  );
}

function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: authApi.sessions });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sessions"] });
  const revoke = useMutation({ mutationFn: authApi.revokeSession, onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });
  const revokeOthers = useMutation({
    mutationFn: authApi.revokeOtherSessions,
    onSuccess: (r) => {
      toast.success(`Signed out ${r.revoked} other device${r.revoked === 1 ? "" : "s"}`);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold">Signed-in devices</h2>
        <button className="btn-secondary" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
          Sign out other devices
        </button>
      </div>
      {sessions.isLoading ? (
        <div className="p-5"><Spinner /></div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Laptop size={18} className="text-slate-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" title={s.userAgent ?? undefined}>
                  {s.userAgent?.slice(0, 80) ?? "Unknown device"} {s.current && <span className="badge-green ml-1">This device</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {s.ipAddress ?? "unknown IP"} · active {timeAgo(s.lastUsedAt)}
                </p>
              </div>
              {!s.current && (
                <button className="btn-ghost" onClick={() => revoke.mutate(s.id)}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SecurityPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Security" subtitle="Your password, two-step sign-in and signed-in devices" />
      <PasswordCard />
      <MfaCard />
      <SessionsCard />
    </div>
  );
}
