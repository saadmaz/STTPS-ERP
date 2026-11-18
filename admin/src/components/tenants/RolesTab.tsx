"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rolesApi, permissionsApi, type Role } from "@/lib/api";
import { Plus, Shield, Trash2, Pencil, Users, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import {  } from "@/lib/utils";
import { PermissionsMatrix } from "@/components/PermissionsMatrix";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Required"),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function RolesTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newPermCodes, setNewPermCodes] = useState<string[]>([]);
  const [editPermCodes, setEditPermCodes] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ["admin-roles", tenantId],
    queryFn: () => rolesApi.list(tenantId),
  });

  const { data: permissions = [] } = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: permissionsApi.list,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setEditPermCodes(role.rolePermissions?.map((rp) => rp.permission.code) ?? []);
  };

  const onCreateSubmit = async (data: FormValues) => {
    try {
      await rolesApi.create(tenantId, { ...data, permissionCodes: newPermCodes });
      toast.success("Role created");
      qc.invalidateQueries({ queryKey: ["admin-roles", tenantId] });
      reset();
      setNewPermCodes([]);
      setShowCreate(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to create role");
    }
  };

  const saveEditPerms = async () => {
    if (!editingRole) return;
    setSavingPerms(true);
    try {
      await rolesApi.updatePermissions(editingRole.id, editPermCodes);
      toast.success("Permissions saved");
      qc.invalidateQueries({ queryKey: ["admin-roles", tenantId] });
      setEditingRole(null);
    } catch { toast.error("Failed to save permissions"); }
    finally { setSavingPerms(false); }
  };

  const handleDelete = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await rolesApi.delete(role.id);
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["admin-roles", tenantId] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? "Failed to delete role");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900">Roles ({roles.length})</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> New Role
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">Loading...</div>
      ) : roles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No roles yet</div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
                    <Shield className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 flex items-center gap-2">
                      {role.name}
                      {role.isSystem && (
                        <span className="text-xs font-normal bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">System</span>
                      )}
                    </p>
                    {role.description && <p className="text-xs text-slate-400 mt-0.5">{role.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{role._count?.userRoles ?? 0} users</span>
                      <span>{role.rolePermissions?.length ?? 0} permissions</span>
                      {role.company && <span>Company: {role.company.name}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(role)}
                    className="p-1.5 text-slate-400 hover:text-brand-600 rounded transition-colors"
                    title="Edit permissions"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => handleDelete(role)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                      title="Delete role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Compact permission tags */}
              {role.rolePermissions && role.rolePermissions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-slate-100">
                  {role.rolePermissions.slice(0, 8).map((rp) => (
                    <span key={rp.permission.code} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-brand-50 text-brand-700">
                      {rp.permission.code}
                    </span>
                  ))}
                  {role.rolePermissions.length > 8 && (
                    <span className="text-xs text-slate-400">+{role.rolePermissions.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Role Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-semibold text-slate-900">New Role</h3>
              <button onClick={() => { setShowCreate(false); reset(); setNewPermCodes([]); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onCreateSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 flex-shrink-0">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Role Name *</label>
                    <input {...register("name")} placeholder="e.g. Finance Manager" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                    <input {...register("description")} placeholder="What this role can do" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
              </div>
              <div className="px-6 pb-2 flex-shrink-0">
                <p className="text-sm font-medium text-slate-700 mb-3">Permissions</p>
              </div>
              <div className="px-6 overflow-y-auto flex-1">
                <PermissionsMatrix permissions={permissions} selected={newPermCodes} onChange={setNewPermCodes} />
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
                <button type="button" onClick={() => { setShowCreate(false); reset(); setNewPermCodes([]); }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                  {isSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating...</> : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Permissions Modal */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="font-semibold text-slate-900">{editingRole.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Edit permissions</p>
              </div>
              <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <PermissionsMatrix permissions={permissions} selected={editPermCodes} onChange={setEditPermCodes} readonly={editingRole.isSystem} />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button type="button" onClick={() => setEditingRole(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              {!editingRole.isSystem && (
                <button
                  type="button"
                  onClick={saveEditPerms}
                  disabled={savingPerms}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                >
                  {savingPerms ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving...</> : <><Check className="w-3.5 h-3.5" />Save Permissions</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
