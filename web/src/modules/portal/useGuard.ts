"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPortalToken } from "@/lib/portal-api";

/** Redirects to the portal login when there is no token; returns whether a token is present. */
export function usePortalGuard(): boolean {
  const router = useRouter();
  const [token] = useState(() => getPortalToken());
  useEffect(() => {
    if (!token) router.replace("/portal/login");
  }, [token, router]);
  return !!token;
}
