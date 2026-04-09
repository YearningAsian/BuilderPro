/**
 * Type-safe API client for the FastAPI backend.
 * Reads the auth token from localStorage (set on sign-in).
 * All requests include the Bearer token automatically.
 */
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

export const BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// ─── Auth token helpers ───────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bp_access_token");
}

export function setToken(token: string): void {
  localStorage.setItem("bp_access_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("bp_access_token");
  localStorage.removeItem("bp_workspace_id");
  localStorage.removeItem("bp_workspace_name");
  localStorage.removeItem("bp_role");
  localStorage.removeItem("bp_email");
  document.cookie = "bp_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

export function setSession(data: {
  // sets localStorage + cookie for middleware
  access_token: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
  role: string;
  email: string;
}): void {
  localStorage.setItem("bp_access_token", data.access_token);
  localStorage.setItem("bp_role", data.role);
  localStorage.setItem("bp_email", data.email);
  if (data.workspace_id) localStorage.setItem("bp_workspace_id", data.workspace_id);
  if (data.workspace_name) localStorage.setItem("bp_workspace_name", data.workspace_name);
}

// ─── Core request helper ──────────────────────────────────────

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init?.headers,
  };

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/signin";
    throw new Error("Session expired. Please sign in again.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${body}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────

export const authApi = {
  signIn: (email: string, password: string) =>
    request<{
      access_token: string;
      token_type: string;
      role: string;
      email: string;
      workspace_id: string | null;
      workspace_name: string | null;
    }>(`${BASE}/auth/signin`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signUpCompany: (data: {
    full_name: string;
    company_name: string;
    email: string;
    password: string;
  }) =>
    request<{
      access_token: string | null;
      role: string;
      email: string;
      workspace_id: string;
      workspace_name: string;
      requires_email_confirmation: boolean;
    }>(`${BASE}/auth/signup-company`, { method: "POST", body: JSON.stringify(data) }),

  joinInvite: (data: {
    invite_token: string;
    full_name: string;
    email: string;
    password: string;
  }) =>
    request<{
      access_token: string | null;
      role: string;
      email: string;
      workspace_id: string;
      workspace_name: string;
      requires_email_confirmation: boolean;
    }>(`${BASE}/auth/join-invite`, { method: "POST", body: JSON.stringify(data) }),

  createInvite: (workspace_id: string, invited_email: string, expires_in_days = 7) =>
    request<{
      invite_token: string;
      workspace_id: string;
      invited_email: string;
      expires_at: string;
    }>(`${BASE}/auth/invites`, {
      method: "POST",
      body: JSON.stringify({ workspace_id, invited_email, expires_in_days }),
    }),
};

// ─── Materials ────────────────────────────────────────────────

export const materialsApi = {
  list: () => request<Material[]>(`${BASE}/materials`),
  get: (id: string) => request<Material>(`${BASE}/materials/${id}`),
  search: (name?: string, category?: string) => {
    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (category) params.set("category", category);
    return request<Material[]>(`${BASE}/materials/search?${params}`);
  },
  create: (data: MaterialCreate) =>
    request<Material>(`${BASE}/materials`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<MaterialCreate>) =>
    request<Material>(`${BASE}/materials/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`${BASE}/materials/${id}`, { method: "DELETE" }),
};

// ─── Projects ─────────────────────────────────────────────────

export interface ProjectSummary {
  project_id: string;
  item_count: number;
  subtotal: number;
  tax_pct: number;
  tax_amount: number;
  grand_total: number;
}

export const projectsApi = {
  list: () => request<Project[]>(`${BASE}/projects`),
  get: (id: string) => request<Project>(`${BASE}/projects/${id}`),
  summary: (id: string) => request<ProjectSummary>(`${BASE}/projects/${id}/summary`),
  create: (data: ProjectCreate) =>
    request<Project>(`${BASE}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ProjectCreate>) =>
    request<Project>(`${BASE}/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`${BASE}/projects/${id}`, { method: "DELETE" }),
};

// ─── Project items ─────────────────────────────────────────────

export interface LineItemResponse {
  id: string;
  project_id: string;
  material_id: string;
  material_name: string;
  unit_type: string;
  unit_cost: number;
  quantity: number;
  waste_pct: number;
  total_qty: number;
  line_subtotal: number;
  created_at: string;
}

export const projectItemsApi = {
  list: (projectId: string) =>
    request<LineItemResponse[]>(`${BASE}/projects/${projectId}/items`),
  create: (projectId: string, data: { material_id: string; quantity: number; waste_pct?: number }) =>
    request<LineItemResponse>(`${BASE}/projects/${projectId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (projectId: string, itemId: string, data: { quantity?: number; waste_pct?: number }) =>
    request<LineItemResponse>(`${BASE}/projects/${projectId}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, itemId: string) =>
    request<void>(`${BASE}/projects/${projectId}/items/${itemId}`, {
      method: "DELETE",
    }),
};

// ─── Customers ────────────────────────────────────────────────

export const customersApi = {
  list: () => request<Customer[]>(`${BASE}/customers`),
  get: (id: string) => request<Customer>(`${BASE}/customers/${id}`),
  create: (data: CustomerCreate) =>
    request<Customer>(`${BASE}/customers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<CustomerCreate>) =>
    request<Customer>(`${BASE}/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`${BASE}/customers/${id}`, { method: "DELETE" }),
};

// ─── Vendors ──────────────────────────────────────────────────

export const vendorsApi = {
  list: () => request<Vendor[]>(`${BASE}/vendors`),
  get: (id: string) => request<Vendor>(`${BASE}/vendors/${id}`),
  create: (data: VendorCreate) =>
    request<Vendor>(`${BASE}/vendors`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<VendorCreate>) =>
    request<Vendor>(`${BASE}/vendors/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`${BASE}/vendors/${id}`, { method: "DELETE" }),
};