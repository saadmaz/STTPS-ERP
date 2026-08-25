"use client";

import { useAuth } from "@/lib/auth";
import {
  Users, Shield, UserCheck, Lock, Bell, KeyRound,
  CheckCircle2, ChevronRight,
} from "lucide-react";

const ROLES = [
  {
    name: "Platform Admin",
    description: "Full access to all modules, companies, and system settings",
    permissions: ["All modules", "User management", "Company management", "System configuration"],
    color: "bg-red-50 border-red-200",
    badge: "badge-red",
  },
  {
    name: "Company Admin",
    description: "Full access within an assigned company, cannot manage platform settings",
    permissions: ["All modules (company-scoped)", "User management", "Company settings"],
    color: "bg-orange-50 border-orange-200",
    badge: "badge-yellow",
  },
  {
    name: "Finance Manager",
    description: "Access to Finance, Procurement, and read-only access to other modules",
    permissions: ["Finance", "Procurement", "Inventory (read)", "HR (read)"],
    color: "bg-blue-50 border-blue-200",
    badge: "badge-blue",
  },
  {
    name: "Operations Manager",
    description: "Access to Inventory, Manufacturing, Procurement, and Logistics",
    permissions: ["Inventory", "Manufacturing", "Procurement", "Field Service"],
    color: "bg-green-50 border-green-200",
    badge: "badge-green",
  },
  {
    name: "HR Manager",
    description: "Full access to HR module, read-only access to employee-related data",
    permissions: ["Human Resources", "Payroll", "Recruitment"],
    color: "bg-teal-50 border-teal-200",
    badge: "badge-slate",
  },
  {
    name: "Viewer",
    description: "Read-only access to all modules within their assigned company",
    permissions: ["All modules (read-only)"],
    color: "bg-slate-50 border-slate-200",
    badge: "badge-slate",
  },
];

const SECURITY_SETTINGS = [
  {
    label: "Two-Factor Authentication",
    description: "Require 2FA for all users in this organisation",
    icon: Lock,
    status: "Disabled",
    statusBadge: "badge-slate",
  },
  {
    label: "Session Timeout",
    description: "Automatically log out inactive users after 30 minutes",
    icon: KeyRound,
    status: "Enabled",
    statusBadge: "badge-green",
  },
  {
    label: "Login Notifications",
    description: "Email users when a new device signs into their account",
    icon: Bell,
    status: "Enabled",
    statusBadge: "badge-green",
  },
  {
    label: "Password Policy",
    description: "Minimum 8 characters, must include uppercase and special character",
    icon: Shield,
    status: "Enforced",
    statusBadge: "badge-green",
  },
];

export default function UsersSettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      {/* Current user card */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Your Account</h2>
        <div className="card p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-lg">
                {user?.firstName?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-800">
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user?.email ?? "Unknown User"}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="badge badge-blue">{user?.role ?? "User"}</span>
                <span className="badge badge-green flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Roles reference */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">Roles & Permissions</h2>
          <span className="badge badge-slate">{ROLES.length} roles</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ROLES.map((role) => (
            <div key={role.name} className={`card p-4 border ${role.color}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <UserCheck size={15} className="text-slate-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-slate-800">{role.name}</p>
                </div>
                <span className={`badge ${role.badge}`}>{role.name.split(" ")[0]}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">{role.description}</p>
              <div className="space-y-1">
                {role.permissions.map((perm) => (
                  <div key={perm} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <ChevronRight size={11} className="text-slate-400" />
                    {perm}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security settings */}
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-3">Security Settings</h2>
        <div className="card overflow-hidden">
          {SECURITY_SETTINGS.map((setting, i) => (
            <div
              key={setting.label}
              className={`flex items-center justify-between p-4 ${
                i < SECURITY_SETTINGS.length - 1 ? "border-b border-slate-100" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <setting.icon size={14} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{setting.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{setting.description}</p>
                </div>
              </div>
              <span className={`badge ${setting.statusBadge} flex-shrink-0 ml-4`}>
                {setting.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Info banner */}
      <div className="card p-4 bg-amber-50 border-amber-200">
        <div className="flex items-start gap-2">
          <Users size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>User management</strong> is handled by your platform administrator via the admin portal.
            Contact your admin to invite new users, change roles, or deactivate accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
