/**
 * Type-safe API client for the FastAPI backend.
 *
 * The frontend now uses these methods for live reads and writes,
 * while keeping the existing UI components and types intact.
 */
import { clearLocalAuthState, getActiveSession } from "@/lib/auth";
import type {
  Material,
  MaterialCreate,
  Vendor,
  VendorCreate,
  Customer,
  CustomerCreate,
  Project,
  ProjectCreate,
  ProjectItem,
  ProjectItemCreate,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

export type SessionInfoResponse = {
  role: "admin" | "user";
  email: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

export type CreateInvitePayload = {
  workspace_id: string;
  invited_email: string;
  expires_in_days?: number;
};

export type CreateInviteResponse = {
  invite_token: string;
  workspace_id: string;
  invited_email: string;
  expires_at: string;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getAuthHeaders(extraHeaders?: HeadersInit): HeadersInit {
  const session = getActiveSession();
  if (!session?.accessToken) {
    throw new Error("You must be signed in to continue.");
  }

  return {
    ...JSON_HEADERS,
    ...(extraHeaders ?? {}),
    Authorization: `Bearer ${session.accessToken}`,
  };
}

function handleExpiredSession(message: string) {
  if (typeof window === "undefined") return;

  clearLocalAuthState();
  sessionStorage.setItem("builderpro_flash_message", message);

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const signInUrl = new URL("/signin", window.location.origin);
  if (currentPath && currentPath !== "/signin") {
    signInUrl.searchParams.set("next", currentPath);
  }
  signInUrl.searchParams.set("signed_out", "1");

  window.location.replace(signInUrl.toString());
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { ...JSON_HEADERS, ...init?.headers },
  });

  const bodyText = await res.text().catch(() => "");
  let payload: unknown = null;

  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = bodyText;
    }
  }

  if (!res.ok) {
    let detailMessage = "";

    if (payload && typeof payload === "object" && "detail" in payload) {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === "string" && detail.trim()) {
        detailMessage = detail;
      }
    } else if (typeof payload === "string" && payload.trim()) {
      detailMessage = payload;
    }

    const isExpiredToken =
      res.status === 401 &&
      /invalid jwt|token is expired|jwt expired|invalid claims/i.test(detailMessage);

    if (isExpiredToken) {
      handleExpiredSession("Your session expired. Please sign in again.");
    }

    throw new Error(detailMessage || `API ${res.status}`);
  }

  if (res.status === 204 || !bodyText) {
    return undefined as T;
  }

  return payload as T;
}

function normalizeMaterial(material: Material): Material {
  return {
    ...material,
    unit_cost: toNumber(material.unit_cost),
    default_waste_pct: toNumber(material.default_waste_pct),
  };
}

function normalizeProjectItem(item: ProjectItem): ProjectItem {
  return {
    ...item,
    quantity: toNumber(item.quantity),
    unit_cost: toNumber(item.unit_cost),
    waste_pct: toNumber(item.waste_pct),
    total_qty: toNumber(item.total_qty),
    line_subtotal: toNumber(item.line_subtotal),
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    default_tax_pct: toNumber(project.default_tax_pct),
    default_waste_pct: toNumber(project.default_waste_pct),
    items: Array.isArray(project.items) ? project.items.map(normalizeProjectItem) : [],
  };
}

export const materialsApi = {
  list: async () => (await request<Material[]>(`${BASE}/materials`)).map(normalizeMaterial),
  get: async (id: string) => normalizeMaterial(await request<Material>(`${BASE}/materials/${id}`)),
  create: async (data: MaterialCreate) =>
    normalizeMaterial(await request<Material>(`${BASE}/materials`, { method: "POST", body: JSON.stringify(data) })),
  update: async (id: string, data: Partial<MaterialCreate>) =>
    normalizeMaterial(await request<Material>(`${BASE}/materials/${id}`, { method: "PUT", body: JSON.stringify(data) })),
  delete: (id: string) =>
    request<void>(`${BASE}/materials/${id}`, { method: "DELETE" }),
};

export const projectsApi = {
  list: async () => (await request<Project[]>(`${BASE}/projects`)).map(normalizeProject),
  get: async (id: string) => normalizeProject(await request<Project>(`${BASE}/projects/${id}`)),
  create: async (data: ProjectCreate) =>
    normalizeProject(await request<Project>(`${BASE}/projects`, { method: "POST", body: JSON.stringify(data) })),
  update: async (id: string, data: Partial<ProjectCreate>) =>
    normalizeProject(await request<Project>(`${BASE}/projects/${id}`, { method: "PUT", body: JSON.stringify(data) })),
  delete: (id: string) =>
    request<void>(`${BASE}/projects/${id}`, { method: "DELETE" }),
};

export const projectItemsApi = {
  list: async (projectId: string) =>
    (await request<ProjectItem[]>(`${BASE}/orders`))
      .map(normalizeProjectItem)
      .filter((item) => item.project_id === projectId),
  create: async (projectId: string, data: ProjectItemCreate) =>
    normalizeProjectItem(
      await request<ProjectItem>(`${BASE}/orders?project_id=${encodeURIComponent(projectId)}`, {
        method: "POST",
        body: JSON.stringify(data),
      })
    ),
  update: async (
    _projectId: string,
    itemId: string,
    data: Partial<Pick<ProjectItem, "quantity" | "unit_cost" | "waste_pct" | "notes">>
  ) =>
    normalizeProjectItem(
      await request<ProjectItem>(`${BASE}/orders/${itemId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      })
    ),
  delete: (_projectId: string, itemId: string) =>
    request<void>(`${BASE}/orders/${itemId}`, { method: "DELETE" }),
};

export const vendorsApi = {
  list: () => request<Vendor[]>(`${BASE}/vendors`),
  get: (id: string) => request<Vendor>(`${BASE}/vendors/${id}`),
  create: (data: VendorCreate) =>
    request<Vendor>(`${BASE}/vendors`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<VendorCreate>) =>
    request<Vendor>(`${BASE}/vendors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`${BASE}/vendors/${id}`, { method: "DELETE" }),
};

export const customersApi = {
  list: () => request<Customer[]>(`${BASE}/customers`),
  get: (id: string) => request<Customer>(`${BASE}/customers/${id}`),
  create: (data: CustomerCreate) =>
    request<Customer>(`${BASE}/customers`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CustomerCreate>) =>
    request<Customer>(`${BASE}/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`${BASE}/customers/${id}`, { method: "DELETE" }),
};

export const authApi = {
  me: () => request<SessionInfoResponse>(`${BASE}/auth/me`, { headers: getAuthHeaders() }),
  createInvite: (data: CreateInvitePayload) =>
    request<CreateInviteResponse>(`${BASE}/auth/invites`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
};
