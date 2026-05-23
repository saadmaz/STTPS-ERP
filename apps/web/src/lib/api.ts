import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach access token from sessionStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const companyId = sessionStorage.getItem("company_id");
    if (companyId) {
      config.headers["x-company-id"] = companyId;
    }
  }
  return config;
});

// Auto-refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post(
          `${API_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const { accessToken } = response.data;
        sessionStorage.setItem("access_token", accessToken);
        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        sessionStorage.clear();
        window.location.href = "/login";
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  register: (data: {
    organizationName: string;
    organizationSlug: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    companyName?: string;
  }) => api.post("/auth/register", data).then((r) => r.data),
};

// ─── Companies ────────────────────────────────────────────────────────────

export const companiesApi = {
  list: () => api.get("/companies").then((r) => r.data),
  get: (id: string) => api.get(`/companies/${id}`).then((r) => r.data),
};

// ─── Finance / GL ─────────────────────────────────────────────────────────

export const glApi = {
  dashboard: () => api.get("/finance/gl/dashboard").then((r) => r.data),

  accounts: {
    list: () => api.get("/finance/gl/accounts").then((r) => r.data),
    get: (id: string) => api.get(`/finance/gl/accounts/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/gl/accounts", data).then((r) => r.data),
    update: (id: string, data: unknown) =>
      api.put(`/finance/gl/accounts/${id}`, data).then((r) => r.data),
  },

  periods: {
    list: (fiscalYear?: number) =>
      api
        .get("/finance/gl/periods", { params: { fiscalYear } })
        .then((r) => r.data),
  },

  journals: {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
      api.get("/finance/gl/journals", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/finance/gl/journals/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/gl/journals", data).then((r) => r.data),
    post: (id: string) => api.patch(`/finance/gl/journals/${id}/post`).then((r) => r.data),
    void: (id: string) => api.patch(`/finance/gl/journals/${id}/void`).then((r) => r.data),
  },

  trialBalance: (fiscalYear: number, period?: number) =>
    api
      .get("/finance/gl/trial-balance", { params: { fiscalYear, period } })
      .then((r) => r.data),
};
