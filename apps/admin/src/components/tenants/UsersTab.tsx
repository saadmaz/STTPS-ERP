"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi, tenantsApi, type User } from "@/lib/api";
import { Plus, UserCheck, UserX, Crown, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { InviteUserModal } from "./InviteUserModal";

export function UsersTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["admin-users", tenantId],
    queryFn: () => usersApi.list(tenantId),
  });

  const { data: tenant } = useQuery({
    queryKey: ["admin-tenant", tenantId],
    queryFn: () => tenantsApi.get(tenantId),
  });

  const handleToggleActive = async (user: User) => {
    setLoadingId(user.id);
    try {
      await usersApi.toggleActive(user.id, !user.isActive);
      toast.success(`User ${user.isActive ? "deactivated" : "activated"}`);
      qc.invalidateQueries({ queryKey: ["admin-users", tenantId] });
    } catch { toast.error("Failed to update user"); }
    finally { setLoadingId(null); }
  };

  const handleToggleSuperAdmin = async (user: User) => {
    setLoadingId(user.id + "-sa");
    try {
      await usersApi.toggleSuperAdmin(user.id, !user.isSuperAdmin);
      toast.success(`${user.isSuperAdmin ? "Removed" : "Assigned"} super admin`);
      qc.invalidateQueries({ queryKey: ["admin-users", tenantId] });
    } catch { toast.error("Failed to update user"); }
    finally { setLoadingId(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900">Users ({users.length})</h2>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Invite User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-5 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Companies & Roles</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Last Login</th>
              <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
              <th className="px-5 py-3 font-medium text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No users yet</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {user.firstName?.[0]}{user.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 flex items-center gap-1.5">
                          {user.firstName} {user.lastName}
                          {user.isSuperAdmin && <Crown className="w-3.5 h-3.5 text-amber-500" title="Super Admin" />}
                        </p>
                        <p className="text-xs text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {user.companyUsers?.map((cu) => (
                        <div key={cu.id} className="text-xs">
                          <span className="font-medium text-slate-700">{cu.company?.name}</span>
                          {cu.userRoles?.length > 0 && (
                            <span className="ml-1 text-slate-400">({cu.userRoles.map((ur) => ur.role?.name).join(", ")})</span>
                          )}
                        </div>
                      ))}
                      {(!user.companyUsers || user.companyUsers.length === 0) && (
                        <span className="text-xs text-slate-400 italic">No company assigned</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${user.isActive ? "text-green-600" : "text-red-500"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-green-500" : "bg-red-500"}`} />
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleToggleSuperAdmin(user)}
                        disabled={loadingId === user.id + "-sa"}
                        className={`p-1.5 rounded transition-colors ${user.isSuperAdmin ? "text-amber-500 hover:text-amber-700" : "text-slate-400 hover:text-amber-500"}`}
                        title={user.isSuperAdmin ? "Remove super admin" : "Make super admin"}
                      >
                        {loadingId === user.id + "-sa" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={loadingId === user.id}
                        className={`p-1.5 rounded transition-colors ${user.isActive ? "text-red-400 hover:text-red-600" : "text-green-400 hover:text-green-600"}`}
                        title={user.isActive ? "Deactivate" : "Activate"}
                      >
                        {loadingId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteUserModal
          tenantId={tenantId}
          companies={tenant?.companies ?? []}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
