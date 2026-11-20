"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useCan } from "@/lib/workspace";
import { MasterListPage, MasterRecordPage } from "@/components/master/MasterData";
import { ConfirmDialog, ErrorState, Field, PageHeader, Spinner } from "@/components/ui/kit";
import { accountOptions, PortalUser, SUPPORT_SCREENS, supportApi } from "./config";

export function SupportList({ entity }: { entity: string }) {
  const config = SUPPORT_SCREENS[entity];
  if (!config) notFound();
  return <MasterListPage config={config} />;
}

export function SupportRecord({ entity, id }: { entity: string; id: string }) {
  const config = SUPPORT_SCREENS[entity];
  if (!config) notFound();
  return <MasterRecordPage config={config} id={id} />;
}

function ProvisionDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (setupToken: string) => void }) {
  const [customerId, setCustomerId] = useState("");
  const [email, setEmail] = useState("");
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);
  useQuery({ queryKey: accountOptions.queryKey, queryFn: async () => { const opts = await accountOptions.load(); setCustomers(opts); return opts; }, enabled: open });
  const run = useMutation({
    mutationFn: () => supportApi.portalUsers.provision({ customerId, email }),
    onSuccess: (r) => { setCustomerId(""); setEmail(""); onDone(r.setupToken); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <ConfirmDialog open={open} title="Create a customer login" confirmLabel="Create" busy={run.isPending} onClose={onClose} onConfirm={() => run.mutate()}>
      <div className="space-y-3">
        <Field label="Customer" required>
          <select className="input-base" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select a customer…</option>
            {customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Email" required><input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      </div>
    </ConfirmDialog>
  );
}

function SetupLinkDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  if (!token) return null;
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/set-password?token=${token}`;
  return (
    <ConfirmDialog open={!!token} title="Setup link created" confirmLabel="Done" onClose={onClose} onConfirm={onClose}
      body="Share this one-time link with the customer out of band (email, phone). It won't be shown again.">
      <input className="input-base" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
    </ConfirmDialog>
  );
}

export function PortalUsersPage() {
  const queryClient = useQueryClient();
  const canCreate = useCan("support.portalUser.create");
  const canEdit = useCan("support.portalUser.edit");
  const canDelete = useCan("support.portalUser.delete");
  const [open, setOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const users = useQuery({ queryKey: ["support.portalUser", "list"], queryFn: () => supportApi.portalUsers.list() });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["support.portalUser", "list"] });

  const deactivate = useMutation({ mutationFn: (id: string) => supportApi.portalUsers.deactivate(id), onSuccess: () => { toast.success("Deactivated"); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const reactivate = useMutation({ mutationFn: (id: string) => supportApi.portalUsers.reactivate(id), onSuccess: () => { toast.success("Reactivated"); invalidate(); }, onError: (e) => toast.error(errorMessage(e)) });
  const reissue = useMutation({
    mutationFn: (id: string) => supportApi.portalUsers.reissue(id),
    onSuccess: (r) => setNewToken(r.setupToken),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader title="Customer portal logins" subtitle="Staff-created only; customers set their own password from a one-time link."
        actions={canCreate ? <button className="btn-primary" onClick={() => setOpen(true)}>New login</button> : undefined} />
      {users.isLoading && <div className="py-20 flex justify-center"><Spinner /></div>}
      {users.isError && <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />}
      {users.data && (
        <table className="table-base">
          <thead><tr><th>Email</th><th>Customer</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.data.items.map((u: PortalUser) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td className="text-xs text-slate-500">{u.customerId}</td>
                <td>{u.isActive ? "Active" : "Deactivated"}</td>
                <td className="text-right space-x-2">
                  {canEdit && <button className="btn-ghost" disabled={reissue.isPending} onClick={() => reissue.mutate(u.id)}>New setup link</button>}
                  {canDelete && u.isActive && <button className="btn-ghost" disabled={deactivate.isPending} onClick={() => deactivate.mutate(u.id)}>Deactivate</button>}
                  {canDelete && !u.isActive && <button className="btn-ghost" disabled={reactivate.isPending} onClick={() => reactivate.mutate(u.id)}>Reactivate</button>}
                </td>
              </tr>
            ))}
            {users.data.items.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500 py-8">No portal logins yet.</td></tr>}
          </tbody>
        </table>
      )}
      <ProvisionDialog open={open} onClose={() => setOpen(false)} onDone={(token) => { setOpen(false); invalidate(); setNewToken(token); }} />
      <SetupLinkDialog token={newToken} onClose={() => setNewToken(null)} />
    </div>
  );
}
