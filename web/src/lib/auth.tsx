"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi } from "./api";

interface Company {
  id: string;
  name: string;
  code: string;
  currency: string;
  timezone?: string;
  logoUrl?: string;
}

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  tenantId: string;
  isSuperAdmin: boolean;
  defaultCompanyId?: string;
  defaultCompanyName?: string;
  companyUsers?: Array<{
    companyId: string;
    role?: string;
    isDefault: boolean;
    company: Company;
  }>;
}

interface AuthContextType {
  user: AuthUser | null;
  companies: Company[];
  activeCompany: Company | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchCompany: (companyId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const profile = await authApi.me();
      setUser(profile);

      const userCompanies = profile.companyUsers?.map(
        (cu: { company: Company }) => cu.company,
      ) || [];
      setCompanies(userCompanies);

      // Restore or set default active company
      const savedCompanyId = sessionStorage.getItem("company_id");
      const activeComp = savedCompanyId
        ? userCompanies.find((c: Company) => c.id === savedCompanyId)
        : userCompanies.find((c: Company) => c.id === profile.defaultCompanyId) || userCompanies[0];

      if (activeComp) {
        setActiveCompany(activeComp);
        sessionStorage.setItem("company_id", activeComp.id);
      }
    } catch {
      setUser(null);
      setCompanies([]);
      setActiveCompany(null);
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("company_id");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (token) {
      loadUser();
    } else {
      setIsLoading(false);
    }
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    sessionStorage.setItem("access_token", result.accessToken);
    if (result.user.defaultCompanyId) {
      sessionStorage.setItem("company_id", result.user.defaultCompanyId);
    }
    await loadUser();
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      sessionStorage.clear();
      document.cookie = "sttps_session=; path=/; max-age=0";
      setUser(null);
      setCompanies([]);
      setActiveCompany(null);
      window.location.href = "/login";
    }
  };

  const switchCompany = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      sessionStorage.setItem("company_id", companyId);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        companies,
        activeCompany,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        switchCompany,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
