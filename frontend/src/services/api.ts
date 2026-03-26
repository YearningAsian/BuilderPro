/**
 * Type-safe API client for the FastAPI backend.
 *
 * Currently the prototype runs on hardcoded seed data via useStore,
 * but these functions are wired up and ready to swap in when the
 * backend endpoints are live. Each method returns typed data.
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

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...JSON_HEADERS, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const materialsApi = {
  list: () => request<Material[]>(`${BASE}/materials`),
  get: (id: string) => request<Material>(`${BASE}/materials/${id}`),
  create: (data: MaterialCreate) =>
    request<Material>(`${BASE}/materials`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MaterialCreate>) =>
    request<Material>(`${BASE}/materials/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`${BASE}/materials/${id}`, { method: "DELETE" }),
};

export const projectsApi = {
  list: () => request<Project[]>(`${BASE}/projects`),
  get: (id: string) => request<Project>(`${BASE}/projects/${id}`),
  create: (data: ProjectCreate) =>
    request<Project>(`${BASE}/projects`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ProjectCreate>) =>
    request<Project>(`${BASE}/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`${BASE}/projects/${id}`, { method: "DELETE" }),
};

export const projectItemsApi = {
  list: (projectId: string) =>
    request<ProjectItem[]>(`${BASE}/projects/${projectId}/items`),
  create: (projectId: string, data: ProjectItemCreate) =>
    request<ProjectItem>(`${BASE}/projects/${projectId}/items`, { method: "POST", body: JSON.stringify(data) }),
  update: (projectId: string, itemId: string, data: Partial<ProjectItemCreate>) =>
    request<ProjectItem>(`${BASE}/projects/${projectId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (projectId: string, itemId: string) =>
    request<void>(`${BASE}/projects/${projectId}/items/${itemId}`, { method: "DELETE" }),
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
