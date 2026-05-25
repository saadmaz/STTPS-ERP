import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("admin_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      sessionStorage.removeItem("admin_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (!data.user?.isPlatformAdmin) throw new Error("Not a platform admin");
    return data as { accessToken: string; user: AdminUser };
  },
  logout: () => api.post("/auth/logout"),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => api.get("/admin/dashboard").then((r) => r.data),
};

// ── Tenants ───────────────────────────────────────────────────────────────────
export const tenantsApi = {
  list: (search?: string) => api.get("/admin/tenants", { params: { search } }).then((r) => r.data),
  get: (id: string) => api.get(`/admin/tenants/${id}`).then((r) => r.data),
  create: (data: CreateTenantInput) => api.post("/admin/tenants", data).then((r) => r.data),
  update: (id: string, data: Partial<CreateTenantInput & { status: string }>) =>
    api.patch(`/admin/tenants/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/admin/tenants/${id}`),
};

// ── Companies ─────────────────────────────────────────────────────────────────
export const companiesApi = {
  list: (tenantId: string) => api.get(`/admin/tenants/${tenantId}/companies`).then((r) => r.data),
  create: (tenantId: string, data: CreateCompanyInput) =>
    api.post(`/admin/tenants/${tenantId}/companies`, data).then((r) => r.data),
  update: (companyId: string, data: Partial<CreateCompanyInput>) =>
    api.patch(`/admin/companies/${companyId}`, data).then((r) => r.data),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (tenantId: string) => api.get(`/admin/tenants/${tenantId}/users`).then((r) => r.data),
  create: (tenantId: string, data: CreateUserInput) =>
    api.post(`/admin/tenants/${tenantId}/users`, data).then((r) => r.data),
  toggleActive: (userId: string, isActive: boolean) =>
    api.patch(`/admin/users/${userId}/active`, { isActive }).then((r) => r.data),
  toggleSuperAdmin: (userId: string, isSuperAdmin: boolean) =>
    api.patch(`/admin/users/${userId}/super-admin`, { isSuperAdmin }).then((r) => r.data),
  resetPassword: (userId: string, newPassword: string) =>
    api.post(`/admin/users/${userId}/reset-password`, { newPassword }),
  assignToCompany: (data: AssignToCompanyInput) =>
    api.post("/admin/company-users", data).then((r) => r.data),
};

// ── Roles ─────────────────────────────────────────────────────────────────────
export const rolesApi = {
  list: (tenantId: string) => api.get(`/admin/tenants/${tenantId}/roles`).then((r) => r.data),
  create: (tenantId: string, data: CreateRoleInput) =>
    api.post(`/admin/tenants/${tenantId}/roles`, data).then((r) => r.data),
  updatePermissions: (roleId: string, permissionCodes: string[]) =>
    api.patch(`/admin/roles/${roleId}/permissions`, { permissionCodes }).then((r) => r.data),
  delete: (roleId: string) => api.delete(`/admin/roles/${roleId}`),
};

// ── Permissions ───────────────────────────────────────────────────────────────
export const permissionsApi = {
  list: () => api.get("/admin/permissions").then((r) => r.data as Permission[]),
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  _count?: { companies: number; users: number };
  companies?: Company[];
  users?: User[];
}

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  legalName?: string;
  taxId?: string;
  currency: string;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  _count?: { companyUsers: number };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLoginAt?: string;
  createdAt: string;
  companyUsers?: CompanyUser[];
}

export interface CompanyUser {
  id: string;
  companyId: string;
  isDefault: boolean;
  company: { id: string; name: string };
  userRoles: { role: { id: string; name: string } }[];
}

export interface Role {
  id: string;
  tenantId: string;
  companyId?: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  company?: { id: string; name: string };
  _count?: { userRoles: number };
  rolePermissions?: { permission: Permission }[];
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  action: string;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  plan?: string;
  companyName?: string;
  currency?: string;
  timezone?: string;
}

export interface CreateCompanyInput {
  name: string;
  code: string;
  legalName?: string;
  taxId?: string;
  currency?: string;
  timezone?: string;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  phone?: string;
  isSuperAdmin?: boolean;
  companyId?: string;
  roleIds?: string[];
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  companyId?: string;
  permissionCodes?: string[];
}

export interface AssignToCompanyInput {
  userId: string;
  companyId: string;
  roleIds?: string[];
  isDefault?: boolean;
}
