import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const TOKEN_KEY = "portal_access_token";

/**
 * A separate client for the customer portal: its own token (no refresh, no
 * company header) kept apart from the staff `api` client in `lib/api.ts`, so
 * a mixed-up tab can never send a portal token to a staff route or vice versa.
 */
export const portalApi = axios.create({ baseURL: `${API_URL}/api/v1/portal`, headers: { "Content-Type": "application/json" } });

export function getPortalToken(): string | null {
  return typeof window === "undefined" ? null : sessionStorage.getItem(TOKEN_KEY);
}
export function setPortalToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}
export function clearPortalToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

portalApi.interceptors.request.use((config) => {
  const token = getPortalToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes("/auth/")) {
      clearPortalToken();
      if (typeof window !== "undefined") window.location.href = "/portal/login";
    }
    return Promise.reject(error);
  },
);

const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TICKET_STATUSES = ["new", "open", "assigned", "in_progress", "waiting_customer", "resolved", "closed"] as const;

export interface PortalTicketReply {
  authorType: "staff" | "customer";
  body: string;
  at: string;
}
export interface PortalTicket {
  id: string;
  number: string;
  subject: string;
  description: string | null;
  category: string | null;
  priority: (typeof TICKET_PRIORITIES)[number];
  status: (typeof TICKET_STATUSES)[number];
  resolvedAt: string | null;
  closedAt: string | null;
  satisfactionRating: number | null;
  satisfactionComment: string | null;
  replies: PortalTicketReply[];
  createdAt: string;
}

export const portalAuthApi = {
  login: (email: string, password: string) => data<{ accessToken: string; portalUser: { id: string; email: string; customerId: string } }>(portalApi.post("/auth/login", { email, password })),
  setPassword: (token: string, password: string) => data<{ ok: true }>(portalApi.post("/auth/set-password", { token, password })),
  changePassword: (currentPassword: string, newPassword: string) => data<{ ok: true }>(portalApi.post("/auth/change-password", { currentPassword, newPassword })),
};

export const portalTicketsApi = {
  mine: () => data<{ items: PortalTicket[] }>(portalApi.get("/tickets")),
  get: (id: string) => data<PortalTicket>(portalApi.get(`/tickets/${id}`)),
  create: (body: { subject: string; description?: string; category?: string; priority?: string }) => data<PortalTicket>(portalApi.post("/tickets", body)),
  reply: (id: string, body: string) => data<PortalTicket>(portalApi.post(`/tickets/${id}/reply`, { body })),
  reopen: (id: string) => data<PortalTicket>(portalApi.post(`/tickets/${id}/reopen`)),
  rate: (id: string, rating: number, comment?: string) => data<PortalTicket>(portalApi.post(`/tickets/${id}/rate`, { rating, comment })),
};

export function portalErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const data = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data;
  const message = data?.message;
  if (Array.isArray(message)) return message.join(". ");
  return message || (error as Error)?.message || fallback;
}
