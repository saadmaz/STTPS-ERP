"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, type AdminUser } from "./api";

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      // Decode the stored JWT to get user info (no extra /me call needed for admin)
      const token = typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null;
      if (!token) { setIsLoading(false); return; }
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser({
        id: payload.sub,
        email: payload.email,
        firstName: payload.firstName ?? "",
        lastName: payload.lastName ?? "",
        tenantId: payload.tenantId,
        isSuperAdmin: payload.isSuperAdmin,
        isPlatformAdmin: payload.isPlatformAdmin,
      });
    } catch {
      sessionStorage.removeItem("admin_token");
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    sessionStorage.setItem("admin_token", result.accessToken);
    document.cookie = "admin_session=1; path=/; max-age=86400";
    setUser(result.user);
  };

  const logout = async () => {
    try { await authApi.logout(); } finally {
      sessionStorage.removeItem("admin_token");
      document.cookie = "admin_session=; path=/; max-age=0";
      setUser(null);
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
