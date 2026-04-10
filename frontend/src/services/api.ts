/**
 * Type-safe API client for the FastAPI backend.
 *
 * The frontend now uses these methods for live reads and writes,
 * while keeping the existing UI components and types intact.
 */
import { clearLocalAuthState, getActiveSession } from "@/lib/auth";
import type {
  AuditLogEntry,
  MaterialAttachment,
  MaterialAttachmentCreate,
  MaterialCsvImportSummary,
  Material,
  MaterialCreate,
  MaterialPriceHistoryEntry,
  Vendor,
  VendorCreate,
  Customer,
  CustomerCreate,
  Project,
  ProjectCreate,
  ProjectItem,
  ProjectItemCreate,
  WorkspaceInviteSummary,
  WorkspaceMember,
  WorkspaceRole,
  SearchEntity,
  SearchResponse,
  PurchaseOrder,
  PurchaseOrderCreate,
  PurchaseOrderUpdate,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

export type SessionInfoResponse = {
  role: WorkspaceRole;
  email: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

export type SessionWorkspaceSummary = {
  workspace_id: string;
  workspace_name: string;
  role: WorkspaceRole;
  is_active: boolean;
};

export type UpdateWorkspaceMemberPayload = {
  role: WorkspaceRole;
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

export type BulkOrdersStatusPayload = {
  vendor_id: string;
  from_status: "ready" | "ordered" | "received" | "draft" | "cancelled";
  to_status: "draft" | "ordered" | "received" | "cancelled";
  po_number?: string | null;
  expected_delivery_at?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
};

export type BulkOrdersStatusResponse = {
  updated_count: number;
  order_ids: string[];
};

export type ForgotPasswordPayload = {
  email: string;
  redirect_to?: string;
};

export type VerifyRecoveryPayload = {
  token?: string;
  token_hash?: string;
  email?: string;
};

export type VerifyRecoveryResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number | null;
};

export type ResetPasswordPayload = {
  access_token: string;
  new_password: string;
};

export type WorkspaceProfileUpdatePayload = {
  name: string;
};

export type WorkspaceProfileResponse = {
  workspace_id: string;
  workspace_name: string;
};

export type WorkspaceBillingSummaryResponse = {
  workspace_id: string;
  member_count: number;
  material_count: number;
  active_project_count: number;
  draft_project_count: number;
  monthly_estimate_total: number;
  plan_name: string;
};

export type SearchParams = {
  q: string;
  entity?: SearchEntity;
  project_status?: "draft" | "active" | "closed";
  material_category?: string;
  vendor_id?: string;
  project_id?: string;
  limit?: number;
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

  const workspaceHeaders: HeadersInit = session.workspaceId
    ? { "X-Workspace-Id": session.workspaceId }
    : {};

  return {
    ...JSON_HEADERS,
    ...workspaceHeaders,
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
  const session = getActiveSession();
  const authHeaders: HeadersInit = session?.accessToken
    ? {
        Authorization: `Bearer ${session.accessToken}`,
        ...(session.workspaceId ? { "X-Workspace-Id": session.workspaceId } : {}),
      }
    : {};

  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { ...JSON_HEADERS, ...authHeaders, ...init?.headers },
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

async function requestText(url: string, init?: RequestInit): Promise<string> {
  const session = getActiveSession();
  const authHeaders: HeadersInit = session?.accessToken
    ? {
        Authorization: `Bearer ${session.accessToken}`,
        ...(session.workspaceId ? { "X-Workspace-Id": session.workspaceId } : {}),
      }
    : {};

  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { ...authHeaders, ...init?.headers },
  });

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(bodyText || `API ${res.status}`);
  }
  return bodyText;
}

async function requestForm<T>(url: string, formData: FormData, method: "POST" | "PUT" = "POST"): Promise<T> {
  const session = getActiveSession();
  const authHeaders: HeadersInit = session?.accessToken
    ? {
        Authorization: `Bearer ${session.accessToken}`,
        ...(session.workspaceId ? { "X-Workspace-Id": session.workspaceId } : {}),
      }
    : {};

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { ...authHeaders },
    body: formData,
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

    throw new Error(detailMessage || `API ${res.status}`);
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

function normalizeMaterialPriceHistoryEntry(entry: MaterialPriceHistoryEntry): MaterialPriceHistoryEntry {
  return {
    ...entry,
    previous_unit_cost: entry.previous_unit_cost === null ? null : toNumber(entry.previous_unit_cost),
    new_unit_cost: toNumber(entry.new_unit_cost),
    source: entry.source ?? null,
    changed_by_user_id: entry.changed_by_user_id ?? null,
  };
}

function normalizeMaterialAttachment(attachment: MaterialAttachment): MaterialAttachment {
  return {
    ...attachment,
    mime_type: attachment.mime_type ?? null,
    size_bytes:
      typeof attachment.size_bytes === "number" && Number.isFinite(attachment.size_bytes)
        ? attachment.size_bytes
        : null,
    uploaded_by_user_id: attachment.uploaded_by_user_id ?? null,
  };
}

function normalizeProjectItem(item: ProjectItem): ProjectItem {
  return {
    ...item,
    order_status: item.order_status ?? "draft",
    po_number: item.po_number ?? null,
    purchase_notes: item.purchase_notes ?? null,
    expected_delivery_at: item.expected_delivery_at ?? null,
    carrier: item.carrier ?? null,
    tracking_number: item.tracking_number ?? null,
    tracking_url: item.tracking_url ?? null,
    ordered_at: item.ordered_at ?? null,
    received_at: item.received_at ?? null,
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

function normalizePurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  return {
    ...order,
    total_amount: toNumber(order.total_amount),
    line_count: toNumber(order.line_count),
    expected_delivery_at: order.expected_delivery_at ?? null,
    carrier: order.carrier ?? null,
    tracking_number: order.tracking_number ?? null,
    tracking_url: order.tracking_url ?? null,
    ordered_at: order.ordered_at ?? null,
    received_at: order.received_at ?? null,
    lines: Array.isArray(order.lines)
      ? order.lines.map((line) => ({
          ...line,
          quantity: toNumber(line.quantity),
          total_qty: toNumber(line.total_qty),
          unit_cost: toNumber(line.unit_cost),
          line_subtotal: toNumber(line.line_subtotal),
          notes: line.notes ?? null,
          purchase_notes: line.purchase_notes ?? null,
        }))
      : [],
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
  listPriceHistory: async (id: string, limit = 50) =>
    (await request<MaterialPriceHistoryEntry[]>(`${BASE}/materials/${id}/price-history?limit=${encodeURIComponent(String(limit))}`))
      .map(normalizeMaterialPriceHistoryEntry),
  listAttachments: async (id: string) =>
    (await request<MaterialAttachment[]>(`${BASE}/materials/${id}/attachments`)).map(normalizeMaterialAttachment),
  createAttachment: async (id: string, data: MaterialAttachmentCreate) =>
    normalizeMaterialAttachment(
      await request<MaterialAttachment>(`${BASE}/materials/${id}/attachments`, {
        method: "POST",
        body: JSON.stringify(data),
      })
    ),
  deleteAttachment: (id: string, attachmentId: string) =>
    request<void>(`${BASE}/materials/${id}/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }),
  uploadAttachment: async (id: string, file: File, name?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (name && name.trim()) {
      formData.append("name", name.trim());
    }

    return normalizeMaterialAttachment(
      await requestForm<MaterialAttachment>(`${BASE}/materials/${id}/attachments/upload`, formData, "POST")
    );
  },
  importCsv: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return requestForm<MaterialCsvImportSummary>(`${BASE}/materials/import/csv`, formData, "POST");
  },
};

export const projectsApi = {
  list: async () => (await request<Project[]>(`${BASE}/projects`)).map(normalizeProject),
  get: async (id: string) => normalizeProject(await request<Project>(`${BASE}/projects/${id}`)),
  create: async (data: ProjectCreate) =>
    normalizeProject(await request<Project>(`${BASE}/projects`, { method: "POST", body: JSON.stringify(data) })),
  duplicate: async (id: string, payload?: { name?: string; include_items?: boolean }) =>
    request<{ project: Project; duplicated_items: number }>(`${BASE}/projects/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }).then((result) => ({
      ...result,
      project: normalizeProject(result.project),
    })),
  estimateDocumentHtml: (id: string, markupPct = 0) =>
    requestText(
      `${BASE}/projects/${encodeURIComponent(id)}/estimate-document?markup_pct=${encodeURIComponent(String(markupPct))}`,
      { method: "GET" },
    ),
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
    data: Partial<Pick<ProjectItem, "quantity" | "unit_cost" | "waste_pct" | "order_status" | "po_number" | "purchase_notes" | "expected_delivery_at" | "carrier" | "tracking_number" | "tracking_url" | "notes">>
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

export const ordersApi = {
  listPurchaseOrders: async (params?: { vendor_id?: string; status?: "draft" | "ordered" | "received" | "cancelled" }) => {
    const query = new URLSearchParams();
    if (params?.vendor_id) query.set("vendor_id", params.vendor_id);
    if (params?.status) query.set("status", params.status);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return (await request<PurchaseOrder[]>(`${BASE}/orders/purchase-orders${suffix}`)).map(normalizePurchaseOrder);
  },
  createPurchaseOrder: async (payload: PurchaseOrderCreate) =>
    normalizePurchaseOrder(
      await request<PurchaseOrder>(`${BASE}/orders/purchase-orders`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    ),
  updatePurchaseOrder: async (poNumber: string, payload: PurchaseOrderUpdate) =>
    normalizePurchaseOrder(
      await request<PurchaseOrder>(`${BASE}/orders/purchase-orders/${encodeURIComponent(poNumber)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
    ),
  purchaseOrderDocumentHtml: (poNumber: string) =>
    requestText(`${BASE}/orders/purchase-orders/${encodeURIComponent(poNumber)}/document`, { method: "GET" }),
  bulkUpdateStatus: (payload: BulkOrdersStatusPayload) =>
    request<BulkOrdersStatusResponse>(`${BASE}/orders/bulk-status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  vendorPoDocumentHtml: (vendorId: string, includeStatus: BulkOrdersStatusPayload["from_status"] = "ready") =>
    requestText(
      `${BASE}/orders/vendor/${encodeURIComponent(vendorId)}/po-document?include_status=${encodeURIComponent(includeStatus)}`,
      { method: "GET" },
    ),
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
  listWorkspaces: () => request<SessionWorkspaceSummary[]>(`${BASE}/auth/workspaces`, { headers: getAuthHeaders() }),
  listAuditEvents: () => request<AuditLogEntry[]>(`${BASE}/auth/audit-log`, { headers: getAuthHeaders() }),
  listMembers: () => request<WorkspaceMember[]>(`${BASE}/auth/members`, { headers: getAuthHeaders() }),
  updateMember: (memberId: string, data: UpdateWorkspaceMemberPayload) =>
    request<WorkspaceMember>(`${BASE}/auth/members/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
  deleteMember: (memberId: string) =>
    request<void>(`${BASE}/auth/members/${encodeURIComponent(memberId)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    }),
  createInvite: (data: CreateInvitePayload) =>
    request<CreateInviteResponse>(`${BASE}/auth/invites`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
  listInvites: (includeExpired = false) =>
    request<WorkspaceInviteSummary[]>(
      `${BASE}/auth/invites?include_expired=${includeExpired ? "true" : "false"}`,
      { headers: getAuthHeaders() },
    ),
  resendInvite: (inviteId: string) =>
    request<CreateInviteResponse>(`${BASE}/auth/invites/${encodeURIComponent(inviteId)}/resend`, {
      method: "POST",
      headers: getAuthHeaders(),
    }),
  revokeInvite: (inviteId: string) =>
    request<void>(`${BASE}/auth/invites/${encodeURIComponent(inviteId)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    }),
  forgotPassword: (data: ForgotPasswordPayload) =>
    request<{ message: string }>(`${BASE}/auth/forgot-password`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  verifyRecovery: (data: VerifyRecoveryPayload) =>
    request<VerifyRecoveryResponse>(`${BASE}/auth/verify-recovery`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resetPassword: (data: ResetPasswordPayload) =>
    request<{ message: string }>(`${BASE}/auth/reset-password`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWorkspaceProfile: (data: WorkspaceProfileUpdatePayload) =>
    request<WorkspaceProfileResponse>(`${BASE}/auth/workspace`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    }),
  getWorkspaceBillingSummary: () =>
    request<WorkspaceBillingSummaryResponse>(`${BASE}/auth/workspace/billing-summary`, {
      headers: getAuthHeaders(),
    }),
};

export const searchApi = {
  run: async (params: SearchParams) => {
    const query = new URLSearchParams();
    query.set("q", params.q);

    if (params.entity) query.set("entity", params.entity);
    if (params.project_status) query.set("project_status", params.project_status);
    if (params.material_category) query.set("material_category", params.material_category);
    if (params.vendor_id) query.set("vendor_id", params.vendor_id);
    if (params.project_id) query.set("project_id", params.project_id);
    if (typeof params.limit === "number") query.set("limit", String(params.limit));

    return request<SearchResponse>(`${BASE}/search?${query.toString()}`);
  },
};
