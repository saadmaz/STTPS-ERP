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

// ─── Finance / AP ──────────────────────────────────────────────────────────

export const apApi = {
  vendors: {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
      api.get("/finance/ap/vendors", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/finance/ap/vendors/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/ap/vendors", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/finance/ap/vendors/${id}`, data).then((r) => r.data),
  },
  invoices: {
    list: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
      api.get("/finance/ap/invoices", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/finance/ap/invoices/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/ap/invoices", data).then((r) => r.data),
    approve: (id: string) => api.patch(`/finance/ap/invoices/${id}/approve`).then((r) => r.data),
    post: (id: string) => api.patch(`/finance/ap/invoices/${id}/post`).then((r) => r.data),
  },
  aging: () => api.get("/finance/ap/aging").then((r) => r.data),
};

// ─── Finance / AR ──────────────────────────────────────────────────────────

export const arApi = {
  customers: {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
      api.get("/finance/ar/customers", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/finance/ar/customers/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/ar/customers", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/finance/ar/customers/${id}`, data).then((r) => r.data),
  },
  invoices: {
    list: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
      api.get("/finance/ar/invoices", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/finance/ar/invoices/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/ar/invoices", data).then((r) => r.data),
    post: (id: string) => api.patch(`/finance/ar/invoices/${id}/post`).then((r) => r.data),
  },
  aging: () => api.get("/finance/ar/aging").then((r) => r.data),
};

// ─── Finance / Reports ─────────────────────────────────────────────────────

export const reportsApi = {
  pl: (fiscalYear: number, fromPeriod = 1, toPeriod = 12) =>
    api.get("/finance/reports/pl", { params: { fiscalYear, fromPeriod, toPeriod } }).then((r) => r.data),
  balanceSheet: (fiscalYear: number, asOfPeriod = 12) =>
    api.get("/finance/reports/balance-sheet", { params: { fiscalYear, asOfPeriod } }).then((r) => r.data),
};

// ─── Finance / Bank ────────────────────────────────────────────────────────

export const bankApi = {
  summary: () => api.get("/finance/bank/summary").then((r) => r.data),
  accounts: {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
      api.get("/finance/bank/accounts", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/finance/bank/accounts/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/finance/bank/accounts", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/finance/bank/accounts/${id}`, data).then((r) => r.data),
    transactions: (id: string, params?: { page?: number; limit?: number }) =>
      api.get(`/finance/bank/accounts/${id}/transactions`, { params }).then((r) => r.data),
  },
  createTransaction: (data: unknown) => api.post("/finance/bank/transactions", data).then((r) => r.data),
};

// ─── Finance / Fixed Assets ────────────────────────────────────────────────

export const assetsApi = {
  summary: () => api.get("/finance/assets/summary").then((r) => r.data),
  list: (params?: { page?: number; limit?: number; search?: string; status?: string; category?: string }) =>
    api.get("/finance/assets", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/finance/assets/${id}`).then((r) => r.data),
  create: (data: unknown) => api.post("/finance/assets", data).then((r) => r.data),
  update: (id: string, data: unknown) => api.put(`/finance/assets/${id}`, data).then((r) => r.data),
  dispose: (id: string, data: { disposalDate: string; disposalAmount: number }) =>
    api.patch(`/finance/assets/${id}/dispose`, data).then((r) => r.data),
  runDepreciation: (asOfDate: string) =>
    api.post("/finance/assets/depreciation/run", null, { params: { asOfDate } }).then((r) => r.data),
};

// ─── Finance / Budgets ─────────────────────────────────────────────────────

export const budgetApi = {
  list: (params?: { page?: number; limit?: number; fiscalYear?: number }) =>
    api.get("/finance/budgets", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/finance/budgets/${id}`).then((r) => r.data),
  create: (data: unknown) => api.post("/finance/budgets", data).then((r) => r.data),
  approve: (id: string) => api.patch(`/finance/budgets/${id}/approve`).then((r) => r.data),
  vsActual: (id: string) => api.get(`/finance/budgets/${id}/vs-actual`).then((r) => r.data),
};

// ─── Inventory ─────────────────────────────────────────────────────────────

export const inventoryApi = {
  summary: () => api.get("/inventory/summary").then((r) => r.data),

  categories: {
    list: () => api.get("/inventory/categories").then((r) => r.data),
    create: (data: unknown) => api.post("/inventory/categories", data).then((r) => r.data),
  },

  items: {
    list: (params?: { page?: number; limit?: number; search?: string; categoryId?: string }) =>
      api.get("/inventory/items", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/inventory/items/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/inventory/items", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/inventory/items/${id}`, data).then((r) => r.data),
  },

  warehouses: {
    list: () => api.get("/inventory/warehouses").then((r) => r.data),
    create: (data: unknown) => api.post("/inventory/warehouses", data).then((r) => r.data),
    createLocation: (data: unknown) => api.post("/inventory/warehouses/locations", data).then((r) => r.data),
  },

  stockLevels: (params?: { warehouseId?: string; itemId?: string }) =>
    api.get("/inventory/stock-levels", { params }).then((r) => r.data),

  movements: {
    list: (params?: { itemId?: string; warehouseId?: string; page?: number; limit?: number }) =>
      api.get("/inventory/movements", { params }).then((r) => r.data),
    create: (data: unknown) => api.post("/inventory/movements", data).then((r) => r.data),
  },

  counts: {
    list: () => api.get("/inventory/counts").then((r) => r.data),
    get: (id: string) => api.get(`/inventory/counts/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/inventory/counts", data).then((r) => r.data),
    post: (id: string) => api.post(`/inventory/counts/${id}/post`, {}).then((r) => r.data),
  },
};

// ─── Procurement ───────────────────────────────────────────────────────────

export const procurementApi = {
  dashboard: () => api.get("/procurement/dashboard").then((r) => r.data),

  vendors: (params?: { search?: string; page?: number; limit?: number }) =>
    api.get("/procurement/vendors", { params }).then((r) => r.data),

  requisitions: {
    list: (params?: { status?: string; page?: number; limit?: number }) =>
      api.get("/procurement/requisitions", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/procurement/requisitions/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/procurement/requisitions", data).then((r) => r.data),
    approve: (id: string) => api.post(`/procurement/requisitions/${id}/approve`, {}).then((r) => r.data),
  },

  orders: {
    list: (params?: { status?: string; vendorId?: string; page?: number; limit?: number }) =>
      api.get("/procurement/orders", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/procurement/orders/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/procurement/orders", data).then((r) => r.data),
    approve: (id: string) => api.post(`/procurement/orders/${id}/approve`, {}).then((r) => r.data),
  },

  receipts: {
    list: (params?: { poId?: string; status?: string; page?: number; limit?: number }) =>
      api.get("/procurement/receipts", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/procurement/receipts/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/procurement/receipts", data).then((r) => r.data),
    post: (id: string) => api.post(`/procurement/receipts/${id}/post`, {}).then((r) => r.data),
  },
};

// ─── CRM ───────────────────────────────────────────────────────────────────

export const crmApi = {
  dashboard: () => api.get("/crm/dashboard").then((r) => r.data),

  leads: {
    list: (params?: { status?: string; search?: string; page?: number; limit?: number }) =>
      api.get("/crm/leads", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/crm/leads/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/crm/leads", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/crm/leads/${id}`, data).then((r) => r.data),
  },

  accounts: {
    list: (params?: { search?: string; page?: number; limit?: number }) =>
      api.get("/crm/accounts", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/crm/accounts/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/crm/accounts", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/crm/accounts/${id}`, data).then((r) => r.data),
  },

  contacts: {
    list: (params?: { accountId?: string; search?: string; page?: number; limit?: number }) =>
      api.get("/crm/contacts", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/crm/contacts/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/crm/contacts", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/crm/contacts/${id}`, data).then((r) => r.data),
  },

  opportunities: {
    list: (params?: { stage?: string; status?: string; accountId?: string; page?: number; limit?: number }) =>
      api.get("/crm/opportunities", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/crm/opportunities/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/crm/opportunities", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/crm/opportunities/${id}`, data).then((r) => r.data),
  },

  activities: {
    list: (params?: { status?: string; type?: string; page?: number; limit?: number }) =>
      api.get("/crm/activities", { params }).then((r) => r.data),
    create: (data: unknown) => api.post("/crm/activities", data).then((r) => r.data),
    complete: (id: string) => api.post(`/crm/activities/${id}/complete`, {}).then((r) => r.data),
  },
};

// ─── Manufacturing ─────────────────────────────────────────────────────────

export const manufacturingApi = {
  dashboard: () => api.get("/manufacturing/dashboard").then((r) => r.data),

  bom: {
    list: (params?: { itemId?: string; status?: string; page?: number; limit?: number }) =>
      api.get("/manufacturing/bom", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/manufacturing/bom/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/manufacturing/bom", data).then((r) => r.data),
    activate: (id: string) => api.post(`/manufacturing/bom/${id}/activate`, {}).then((r) => r.data),
  },

  workCenters: {
    list: () => api.get("/manufacturing/work-centers").then((r) => r.data),
    create: (data: unknown) => api.post("/manufacturing/work-centers", data).then((r) => r.data),
  },

  routings: {
    list: () => api.get("/manufacturing/routings").then((r) => r.data),
    get: (id: string) => api.get(`/manufacturing/routings/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/manufacturing/routings", data).then((r) => r.data),
  },

  orders: {
    list: (params?: { status?: string; itemId?: string; page?: number; limit?: number }) =>
      api.get("/manufacturing/orders", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/manufacturing/orders/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/manufacturing/orders", data).then((r) => r.data),
    release: (id: string) => api.post(`/manufacturing/orders/${id}/release`, {}).then((r) => r.data),
    produce: (id: string, data: unknown) => api.post(`/manufacturing/orders/${id}/produce`, data).then((r) => r.data),
  },

  mrp: {
    list: () => api.get("/manufacturing/mrp").then((r) => r.data),
    get: (id: string) => api.get(`/manufacturing/mrp/${id}`).then((r) => r.data),
    run: (data: unknown) => api.post("/manufacturing/mrp/run", data).then((r) => r.data),
  },
};

// ─── HR ────────────────────────────────────────────────────────────────────

export const hrApi = {
  dashboard: () => api.get("/hr/dashboard").then((r) => r.data),

  departments: {
    list: () => api.get("/hr/departments").then((r) => r.data),
    create: (data: unknown) => api.post("/hr/departments", data).then((r) => r.data),
  },

  positions: {
    list: () => api.get("/hr/positions").then((r) => r.data),
    create: (data: unknown) => api.post("/hr/positions", data).then((r) => r.data),
  },

  employees: {
    list: (params?: { status?: string; departmentId?: string; page?: number; limit?: number }) =>
      api.get("/hr/employees", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/hr/employees/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/hr/employees", data).then((r) => r.data),
    update: (id: string, data: unknown) => api.put(`/hr/employees/${id}`, data).then((r) => r.data),
  },

  leaveTypes: {
    list: () => api.get("/hr/leave-types").then((r) => r.data),
    create: (data: unknown) => api.post("/hr/leave-types", data).then((r) => r.data),
  },

  leave: {
    list: (params?: { status?: string; employeeId?: string; page?: number; limit?: number }) =>
      api.get("/hr/leave", { params }).then((r) => r.data),
    create: (data: unknown) => api.post("/hr/leave", data).then((r) => r.data),
    process: (id: string, data: unknown) => api.post(`/hr/leave/${id}/process`, data).then((r) => r.data),
  },

  payroll: {
    list: () => api.get("/hr/payroll").then((r) => r.data),
    get: (id: string) => api.get(`/hr/payroll/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/hr/payroll", data).then((r) => r.data),
    approve: (id: string) => api.post(`/hr/payroll/${id}/approve`, {}).then((r) => r.data),
  },

  recruitment: {
    postings: {
      list: (params?: { status?: string; page?: number; limit?: number }) =>
        api.get("/hr/recruitment/postings", { params }).then((r) => r.data),
      create: (data: unknown) => api.post("/hr/recruitment/postings", data).then((r) => r.data),
      publish: (id: string) => api.post(`/hr/recruitment/postings/${id}/publish`, {}).then((r) => r.data),
    },
    applications: {
      list: (params?: { jobPostingId?: string; stage?: string; page?: number; limit?: number }) =>
        api.get("/hr/recruitment/applications", { params }).then((r) => r.data),
      create: (data: unknown) => api.post("/hr/recruitment/applications", data).then((r) => r.data),
      updateStage: (id: string, data: unknown) =>
        api.put(`/hr/recruitment/applications/${id}/stage`, data).then((r) => r.data),
    },
  },
};

// ─── Sales ─────────────────────────────────────────────────────────────────

export const salesApi = {
  dashboard: () => api.get("/sales/dashboard").then((r) => r.data),

  priceLists: {
    list: () => api.get("/sales/price-lists").then((r) => r.data),
    get: (id: string) => api.get(`/sales/price-lists/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/sales/price-lists", data).then((r) => r.data),
  },

  quotes: {
    list: (params?: { status?: string; customerId?: string; page?: number; limit?: number }) =>
      api.get("/sales/quotes", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/sales/quotes/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/sales/quotes", data).then((r) => r.data),
    approve: (id: string) => api.post(`/sales/quotes/${id}/approve`, {}).then((r) => r.data),
    convert: (id: string, orderNumber: string) =>
      api.post(`/sales/quotes/${id}/convert`, { orderNumber }).then((r) => r.data),
  },

  orders: {
    list: (params?: { status?: string; customerId?: string; page?: number; limit?: number }) =>
      api.get("/sales/orders", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/sales/orders/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/sales/orders", data).then((r) => r.data),
    approve: (id: string) => api.post(`/sales/orders/${id}/approve`, {}).then((r) => r.data),
  },

  deliveries: {
    list: (params?: { soId?: string; status?: string; page?: number; limit?: number }) =>
      api.get("/sales/deliveries", { params }).then((r) => r.data),
    get: (id: string) => api.get(`/sales/deliveries/${id}`).then((r) => r.data),
    create: (data: unknown) => api.post("/sales/deliveries", data).then((r) => r.data),
    post: (id: string) => api.post(`/sales/deliveries/${id}/post`, {}).then((r) => r.data),
  },
};
