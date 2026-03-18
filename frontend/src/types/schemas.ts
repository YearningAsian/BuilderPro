/**
 * Zod validation schemas for all user-facing forms.
 * These mirror the Pydantic "Create" / "Update" models so that
 * client-side validation matches server-side rules exactly.
 */
import { z } from "zod";

// ─── Shared helpers ──────────────────────────────────────────
const uuidSchema = z.string().uuid("Must be a valid UUID");

const nonNegativeDecimal = z
  .number()
  .min(0, "Cannot be negative");

const percentageDecimal = z
  .number()
  .min(0, "Cannot be negative")
  .max(100, "Cannot exceed 100%");

// ─── Material ────────────────────────────────────────────────
export const materialCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().max(100).nullable().optional(),
  unit_type: z.string().min(1, "Unit type is required"),
  unit_cost: nonNegativeDecimal,
  sku: z.string().max(50).nullable().optional(),
  default_vendor_id: uuidSchema.nullable().optional(),
  size_dims: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  is_taxable: z.boolean().default(true),
  default_waste_pct: percentageDecimal.default(0),
});

export type MaterialFormValues = z.infer<typeof materialCreateSchema>;

// ─── Project Item (line in a record) ─────────────────────────
export const projectItemCreateSchema = z.object({
  material_id: uuidSchema,
  quantity: z
    .number()
    .min(0.001, "Quantity must be greater than 0"),
  unit_type: z.string().min(1, "Unit type is required"),
  unit_cost: nonNegativeDecimal,
  waste_pct: percentageDecimal.default(0),
  notes: z.string().max(1000).nullable().optional(),
});

export type ProjectItemFormValues = z.infer<typeof projectItemCreateSchema>;

// ─── Project ─────────────────────────────────────────────────
export const projectCreateSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  customer_id: uuidSchema,
  status: z.enum(["draft", "active", "closed"]).default("draft"),
  default_tax_pct: percentageDecimal.default(0),
  default_waste_pct: percentageDecimal.default(0),
});

export type ProjectFormValues = z.infer<typeof projectCreateSchema>;

// ─── Customer ────────────────────────────────────────────────
export const customerCreateSchema = z.object({
  name: z.string().min(1, "Customer name is required").max(200),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email("Invalid email").nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type CustomerFormValues = z.infer<typeof customerCreateSchema>;

// ─── Vendor ──────────────────────────────────────────────────
export const vendorCreateSchema = z.object({
  name: z.string().min(1, "Vendor name is required").max(200),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email("Invalid email").nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type VendorFormValues = z.infer<typeof vendorCreateSchema>;
