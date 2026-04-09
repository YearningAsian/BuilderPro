/**
 * TypeScript interfaces mirroring the FastAPI Pydantic v2 schemas.
 * Every field maps 1-to-1 with backend/app/schemas/schemas.py so
 * end-to-end type safety is maintained.
 */

// ─── Primitives ──────────────────────────────────────────────
/** UUID represented as a string on the wire (JSON) */
export type UUID = string;

/** ISO-8601 timestamp string */
export type ISODateString = string;

export type WorkspaceRole = "admin" | "user";

// ─── User ────────────────────────────────────────────────────
export interface User {
  id: UUID;
  email: string;
  full_name: string | null;
  role: WorkspaceRole;
  created_at: ISODateString;
}

export interface UserCreate {
  email: string;
  full_name?: string | null;
  role?: WorkspaceRole;
}

export interface WorkspaceMember {
  id: UUID;
  user_id: UUID;
  email: string;
  full_name: string | null;
  role: WorkspaceRole;
  created_at: ISODateString;
}

export interface WorkspaceInviteSummary {
  id: UUID;
  workspace_id: UUID;
  invited_email: string;
  invite_token: string;
  invited_by_user_id: UUID;
  expires_at: ISODateString;
  created_at: ISODateString;
  is_expired: boolean;
}

export interface AuditLogEntry {
  id: UUID;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: UUID | null;
  actor_email: string | null;
  details: Record<string, unknown> | null;
  created_at: ISODateString;
}

// ─── Customer ────────────────────────────────────────────────
export interface Customer {
  id: UUID;
  workspace_id?: UUID;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: ISODateString;
}

export interface CustomerCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

// ─── Vendor ──────────────────────────────────────────────────
export interface Vendor {
  id: UUID;
  workspace_id?: UUID;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: ISODateString;
}

export interface VendorCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

// ─── Material ────────────────────────────────────────────────
export interface Material {
  id: UUID;
  workspace_id?: UUID;
  name: string;
  category: string | null;
  unit_type: string;
  unit_cost: number;
  sku: string | null;
  default_vendor_id: UUID | null;
  size_dims: string | null;
  notes: string | null;
  is_taxable: boolean;
  default_waste_pct: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface MaterialCreate {
  name: string;
  category?: string | null;
  unit_type: string;
  unit_cost: number;
  sku?: string | null;
  default_vendor_id?: UUID | null;
  size_dims?: string | null;
  notes?: string | null;
  is_taxable?: boolean;
  default_waste_pct?: number;
}

export interface MaterialPriceHistoryEntry {
  id: UUID;
  material_id: UUID;
  previous_unit_cost: number | null;
  new_unit_cost: number;
  source: string | null;
  changed_by_user_id: UUID | null;
  changed_at: ISODateString;
}

export interface MaterialAttachment {
  id: string;
  material_id: UUID;
  name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: ISODateString;
  uploaded_by_user_id: UUID | null;
}

export interface MaterialAttachmentCreate {
  name: string;
  url: string;
  mime_type?: string | null;
  size_bytes?: number | null;
}

export interface MaterialCsvImportError {
  row: number;
  message: string;
}

export interface MaterialCsvImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: MaterialCsvImportError[];
}

// ─── Project Item (line item in a record/estimate) ───────────
export type OrderStatus = "draft" | "ordered" | "received" | "cancelled";

export interface ProjectItem {
  id: UUID;
  project_id: UUID;
  material_id: UUID;
  quantity: number;
  unit_type: string;
  unit_cost: number;
  waste_pct: number;
  total_qty: number;
  line_subtotal: number;
  order_status: OrderStatus;
  po_number: string | null;
  purchase_notes: string | null;
  expected_delivery_at: ISODateString | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  notes: string | null;
  ordered_at: ISODateString | null;
  received_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ProjectItemCreate {
  material_id: UUID;
  quantity: number;
  unit_type: string;
  unit_cost: number;
  waste_pct?: number;
  order_status?: OrderStatus;
  po_number?: string | null;
  purchase_notes?: string | null;
  expected_delivery_at?: ISODateString | null;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  notes?: string | null;
}

// ─── Project ─────────────────────────────────────────────────
export type ProjectStatus = "draft" | "active" | "closed";

export interface Project {
  id: UUID;
  workspace_id?: UUID;
  name: string;
  customer_id: UUID;
  status: ProjectStatus;
  default_tax_pct: number;
  default_waste_pct: number;
  created_by: UUID | null;
  created_at: ISODateString;
  updated_at: ISODateString;
  items: ProjectItem[];
}

export interface ProjectCreate {
  name: string;
  customer_id: UUID;
  status?: ProjectStatus;
  default_tax_pct?: number;
  default_waste_pct?: number;
}

export interface ProjectDetail extends Project {
  customer: Customer;
}

// ─── Sort / Filter helpers ───────────────────────────────────
export type SortDirection = "asc" | "desc";

export interface SortConfig<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export type SearchEntity = "all" | "materials" | "projects" | "customers" | "vendors";

export interface SearchMaterialResult {
  id: UUID;
  name: string;
  category: string | null;
  sku: string | null;
  unit_type: string;
  unit_cost: number;
  default_vendor_id: UUID | null;
}

export interface SearchProjectResult {
  id: UUID;
  name: string;
  status: ProjectStatus;
  customer_id: UUID;
  item_count: number;
  estimate_total: number;
}

export interface SearchCustomerResult {
  id: UUID;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface SearchVendorResult {
  id: UUID;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface SearchResponse {
  query: string;
  total: number;
  materials: SearchMaterialResult[];
  projects: SearchProjectResult[];
  customers: SearchCustomerResult[];
  vendors: SearchVendorResult[];
}
