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

// ─── User ────────────────────────────────────────────────────
export interface User {
  id: UUID;
  email: string;
  full_name: string | null;
  role: "admin" | "user";
  created_at: ISODateString;
}

export interface UserCreate {
  email: string;
  full_name?: string | null;
  role?: "admin" | "user";
}

// ─── Customer ────────────────────────────────────────────────
export interface Customer {
  id: UUID;
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

// ─── Project Item (line item in a record/estimate) ───────────
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
  notes: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ProjectItemCreate {
  material_id: UUID;
  quantity: number;
  unit_type: string;
  unit_cost: number;
  waste_pct?: number;
  notes?: string | null;
}

// ─── Project ─────────────────────────────────────────────────
export type ProjectStatus = "draft" | "active" | "closed";

export interface Project {
  id: UUID;
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
