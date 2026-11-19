import axios, { AxiosError } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach the access token and the selected company to every request.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = sessionStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    const companyId = sessionStorage.getItem("company_id");
    if (companyId) config.headers["x-company-id"] = companyId;
  }
  return config;
});

// Refresh the access token once on 401, queueing concurrent requests meanwhile.
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes("/auth/")) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {}, { withCredentials: true });
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

/** The API's error message, for toasts. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  const data = (error as AxiosError<{ message?: string | string[] }>)?.response?.data;
  const message = data?.message;
  if (Array.isArray(message)) return message.join(". ");
  return message || (error as Error)?.message || fallback;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Fields every company-scoped record carries. */
export interface BaseRecord {
  id: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
  archivedAt: string | null;
  customFields?: Record<string, unknown>;
}

export interface ListParams {
  limit?: number;
  cursor?: string | null;
  q?: string;
  where?: string;
  sort?: string;
  includeArchived?: boolean;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason?: string | null;
  createdAt: string;
}

const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data);

/** Standard client for any master-data endpoint built on the API's generic controller. */
export function crud<T extends BaseRecord>(path: string) {
  return {
    list: (params: ListParams = {}) => data<Page<T>>(api.get(path, { params: clean(params) })),
    get: (id: string) => data<T>(api.get(`${path}/${id}`)),
    create: (body: object) => data<T>(api.post(path, body)),
    update: (id: string, body: object, version?: number) =>
      data<T>(api.patch(`${path}/${id}`, body, { headers: version ? { "If-Match": String(version) } : {} })),
    archive: (id: string, reason?: string) => data<T>(api.post(`${path}/${id}/archive`, { reason })),
    restore: (id: string) => data<T>(api.post(`${path}/${id}/restore`, {})),
    history: (id: string) => data<AuditEntry[]>(api.get(`${path}/${id}/history`)),
  };
}

export type CrudClient<T extends BaseRecord> = ReturnType<typeof crud<T>>;

function clean(params: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

// ─── Auth and companies ──────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) => data<{ accessToken: string; user: Record<string, unknown> & { defaultCompanyId?: string } }>(api.post("/auth/login", { email, password })),
  logout: () => data(api.post("/auth/logout")),
  me: () => data<Record<string, unknown>>(api.get("/auth/me")),
  register: (body: {
    organizationName: string;
    organizationSlug: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    companyName?: string;
  }) => data(api.post("/auth/register", body)),
};

export const companiesApi = {
  list: () => data<Array<{ id: string; name: string; code: string; currency: string; timezone: string; isActive: boolean }>>(api.get("/companies")),
  get: (id: string) => data(api.get(`/companies/${id}`)),
};

// ─── Platform ─────────────────────────────────────────────────────────────

export interface ModuleState {
  key: string;
  name: string;
  description: string;
  group: string;
  core: boolean;
  available: boolean;
  enabled: boolean;
  dependsOn: string[];
}

export interface WorkspaceContext {
  tenantId: string;
  companyId: string;
  userId: string;
  allPermissions: boolean;
  permissions: string[];
  modules: string[];
}

export interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: "low" | "normal" | "high";
  readAt: string | null;
  createdAt: string;
}

export interface ApprovalStep {
  name: string;
  minApprovals: number;
  approverIds: string[];
  approvedBy: string[];
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  escalated: boolean;
}

export interface ApprovalRequest extends BaseRecord {
  definitionName: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  link: string | null;
  requesterId: string;
  status: "pending" | "approved" | "rejected" | "changes_requested" | "cancelled";
  currentStep: number;
  steps: ApprovalStep[];
  decisions: Array<{ step: number; userId: string; onBehalfOf: string | null; decision: string; comment: string | null; at: string }>;
}

export interface SearchHit {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  link: string;
  typeLabel: string;
}

export interface ActivityItem {
  at: string;
  kind: "audit" | "comment" | "approval";
  actorId: string | null;
  action: string;
  summary: string;
  data: Record<string, unknown> | null;
}

export interface FileItem extends BaseRecord {
  name: string;
  contentType: string;
  size: number;
  fileVersion: number;
}

export interface SavedView extends BaseRecord {
  entityType: string;
  name: string;
  ownerId: string;
  shared: boolean;
  config: { where?: string; sort?: string; q?: string; columns?: string[] };
}

export interface CustomFieldDefinition extends BaseRecord {
  entityType: string;
  key: string;
  label: string;
  type: "text" | "longText" | "number" | "decimal" | "date" | "boolean" | "select" | "multiselect" | "user" | "url" | "email";
  options: string[];
  required: boolean;
  helpText: string | null;
  order: number;
  isActive: boolean;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
}

export const platformApi = {
  modules: () => data<ModuleState[]>(api.get("/platform/modules")),
  setModule: (key: string, enabled: boolean) => data<ModuleState[]>(api.put(`/platform/modules/${key}`, { enabled })),
  context: () => data<WorkspaceContext>(api.get("/me/context")),
  work: () => data<{ approvalsWaiting: ApprovalRequest[]; myOpenRequests: ApprovalRequest[]; unreadNotifications: number }>(api.get("/me/work")),
  directory: () => data<UserSummary[]>(api.get("/me/directory")),
  search: (q: string) => data<SearchHit[]>(api.get("/search", { params: { q } })),
};

export const notificationsApi = {
  list: (unread = false) => data<NotificationItem[]>(api.get("/me/notifications", { params: unread ? { unread: "true" } : {} })),
  unreadCount: () => data<{ count: number }>(api.get("/me/notifications/unread-count")),
  markRead: (id: string) => data(api.post(`/me/notifications/${id}/read`)),
  markAllRead: () => data(api.post("/me/notifications/read-all")),
};

export const approvalsApi = {
  list: (scope: "waiting" | "submitted") => data<ApprovalRequest[]>(api.get("/workflow/requests", { params: { scope } })),
  get: (id: string) => data<ApprovalRequest>(api.get(`/workflow/requests/${id}`)),
  forRecord: (type: string, id: string) => data<ApprovalRequest[]>(api.get(`/workflow/requests/for/${type}/${id}`)),
  approve: (id: string, comment?: string) => data<ApprovalRequest>(api.post(`/workflow/requests/${id}/approve`, { comment })),
  reject: (id: string, comment: string) => data<ApprovalRequest>(api.post(`/workflow/requests/${id}/reject`, { comment })),
  requestChanges: (id: string, comment: string) => data<ApprovalRequest>(api.post(`/workflow/requests/${id}/request-changes`, { comment })),
  cancel: (id: string, comment?: string) => data<ApprovalRequest>(api.post(`/workflow/requests/${id}/cancel`, { comment })),
};

export const recordsApi = {
  activity: (type: string, id: string) => data<ActivityItem[]>(api.get(`/records/${type}/${id}/activity`)),
  addComment: (type: string, id: string, body: string) => data(api.post(`/records/${type}/${id}/comments`, { body })),
  tags: (type: string, id: string) => data<string[]>(api.get(`/records/${type}/${id}/tags`)),
  setTags: (type: string, id: string, tags: string[]) => data<string[]>(api.put(`/records/${type}/${id}/tags`, { tags })),
  related: (type: string, id: string) =>
    data<Array<{ linkId: string; direction: string; relation: string; entityType: string; entityId: string; typeLabel: string; link: string }>>(
      api.get(`/records/${type}/${id}/related`),
    ),
  files: (type: string, id: string) => data<FileItem[]>(api.get(`/records/${type}/${id}/files`)),
  customFields: (type: string) => data<CustomFieldDefinition[]>(api.get(`/records/${type}/_/custom-fields`)),
  views: (entityType: string) => data<SavedView[]>(api.get("/views", { params: { entityType } })),
  createView: (body: { entityType: string; name: string; shared?: boolean; config: SavedView["config"] }) => data<SavedView>(api.post("/views", body)),
  deleteView: (id: string) => data(api.delete(`/views/${id}`)),
};

export const filesApi = {
  /** Uploads a file to a record: request a presigned URL, PUT the bytes, confirm. */
  async upload(type: string, id: string, file: File, replacesFileId?: string): Promise<FileItem> {
    const contentType = file.type || "application/octet-stream";
    const start = await data<{ file: FileItem; uploadUrl: string; headers: Record<string, string> }>(
      api.post("/files/upload-url", { entityType: type, entityId: id, name: file.name, contentType, size: file.size, replacesFileId }),
    );
    const put = await fetch(start.uploadUrl, { method: "PUT", headers: start.headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    return data<FileItem>(api.post(`/files/${start.file.id}/complete`));
  },
  downloadUrl: (id: string) => data<{ url: string; name: string }>(api.get(`/files/${id}/download`)),
  remove: (id: string) => data(api.delete(`/files/${id}`)),
};
