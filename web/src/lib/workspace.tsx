"use client";

import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformApi, WorkspaceContext } from "./api";
import { useAuth } from "./auth";

interface Workspace {
  context: WorkspaceContext | null;
  loading: boolean;
  can: (permission: string) => boolean;
  moduleEnabled: (key: string) => boolean;
}

const WorkspaceCtx = createContext<Workspace>({ context: null, loading: true, can: () => false, moduleEnabled: () => false });

/**
 * Permissions and enabled modules for the selected company. The API enforces
 * every rule again; this only decides what the UI shows.
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["me-context", activeCompany?.id],
    queryFn: platformApi.context,
    enabled: !!activeCompany,
    staleTime: 60_000,
  });
  const value: Workspace = {
    context: data ?? null,
    loading: isLoading,
    can: (permission) => !!data && (data.allPermissions || data.permissions.includes(permission)),
    moduleEnabled: (key) => !!data && data.modules.includes(key),
  };
  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace(): Workspace {
  return useContext(WorkspaceCtx);
}

export function useCan(permission: string): boolean {
  return useWorkspace().can(permission);
}
