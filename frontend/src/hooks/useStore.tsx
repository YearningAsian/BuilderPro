/**
 * Central store for the prototype.
 * Wraps hardcoded seed data in React state so it can be mutated
 * by the Record Builder, Projects page, etc. and shared across
 * the component tree via context.
 *
 * When the real backend is wired up, replace this context with
 * TanStack Query cache and API calls.
 */
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  Material,
  Vendor,
  Customer,
  Project,
  ProjectItem,
} from "@/types";
import {
  SEED_MATERIALS,
  SEED_VENDORS,
  SEED_CUSTOMERS,
  SEED_PROJECTS,
} from "@/data/seed";

// ─── Context value type ──────────────────────────────────────
interface StoreValue {
  materials: Material[];
  vendors: Vendor[];
  customers: Customer[];
  projects: Project[];

  /** Add a line item to a project and return the new item. */
  addItemToProject: (
    projectId: string,
    material: Material,
    quantity: number,
    wastePctOverride?: number,
    unitCostOverride?: number,
  ) => ProjectItem;

  /** Remove a line item from a project. */
  removeItemFromProject: (projectId: string, itemId: string) => void;

  /** Update quantity / waste / cost of an existing line item. */
  updateProjectItem: (
    projectId: string,
    itemId: string,
    patch: Partial<Pick<ProjectItem, "quantity" | "waste_pct" | "unit_cost" | "notes">>,
  ) => void;

  /** Create a new empty project. */
  createProject: (name: string, customerId: string) => Project;

  /** Lookup helpers */
  getMaterialById: (id: string) => Material | undefined;
  getVendorById: (id: string) => Vendor | undefined;
  getCustomerById: (id: string) => Customer | undefined;
  getProjectById: (id: string) => Project | undefined;
}

const StoreContext = createContext<StoreValue | null>(null);

// ─── Calculation helpers ─────────────────────────────────────

/** total_qty = quantity × (1 + waste_pct / 100) */
function calcTotalQty(quantity: number, wastePct: number): number {
  return +(quantity * (1 + wastePct / 100)).toFixed(3);
}

/** line_subtotal = total_qty × unit_cost */
function calcLineSubtotal(totalQty: number, unitCost: number): number {
  return +(totalQty * unitCost).toFixed(2);
}

// ─── Provider ────────────────────────────────────────────────
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [materials] = useState<Material[]>(SEED_MATERIALS);
  const [vendors] = useState<Vendor[]>(SEED_VENDORS);
  const [customers] = useState<Customer[]>(SEED_CUSTOMERS);
  const [projects, setProjects] = useState<Project[]>(SEED_PROJECTS);

  // ── Lookups ──
  const getMaterialById = useCallback(
    (id: string) => materials.find((m) => m.id === id),
    [materials],
  );
  const getVendorById = useCallback(
    (id: string) => vendors.find((v) => v.id === id),
    [vendors],
  );
  const getCustomerById = useCallback(
    (id: string) => customers.find((c) => c.id === id),
    [customers],
  );
  const getProjectById = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  // ── Mutations ──
  const addItemToProject = useCallback(
    (
      projectId: string,
      material: Material,
      quantity: number,
      wastePctOverride?: number,
      unitCostOverride?: number,
    ): ProjectItem => {
      const wastePct = wastePctOverride ?? material.default_waste_pct;
      const unitCost = unitCostOverride ?? material.unit_cost;
      const totalQty = calcTotalQty(quantity, wastePct);
      const lineSubtotal = calcLineSubtotal(totalQty, unitCost);
      const now = new Date().toISOString();

      const item: ProjectItem = {
        id: uuidv4(),
        project_id: projectId,
        material_id: material.id,
        quantity,
        unit_type: material.unit_type,
        unit_cost: unitCost,
        waste_pct: wastePct,
        total_qty: totalQty,
        line_subtotal: lineSubtotal,
        notes: null,
        created_at: now,
        updated_at: now,
      };

      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, items: [...p.items, item], updated_at: now }
            : p,
        ),
      );

      return item;
    },
    [],
  );

  const removeItemFromProject = useCallback(
    (projectId: string, itemId: string) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                items: p.items.filter((i) => i.id !== itemId),
                updated_at: new Date().toISOString(),
              }
            : p,
        ),
      );
    },
    [],
  );

  const updateProjectItem = useCallback(
    (
      projectId: string,
      itemId: string,
      patch: Partial<Pick<ProjectItem, "quantity" | "waste_pct" | "unit_cost" | "notes">>,
    ) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            updated_at: new Date().toISOString(),
            items: p.items.map((item) => {
              if (item.id !== itemId) return item;
              const qty = patch.quantity ?? item.quantity;
              const wp = patch.waste_pct ?? item.waste_pct;
              const uc = patch.unit_cost ?? item.unit_cost;
              const totalQty = calcTotalQty(qty, wp);
              return {
                ...item,
                ...patch,
                quantity: qty,
                waste_pct: wp,
                unit_cost: uc,
                total_qty: totalQty,
                line_subtotal: calcLineSubtotal(totalQty, uc),
                updated_at: new Date().toISOString(),
              };
            }),
          };
        }),
      );
    },
    [],
  );

  const createProject = useCallback(
    (name: string, customerId: string): Project => {
      const now = new Date().toISOString();
      const project: Project = {
        id: uuidv4(),
        name,
        customer_id: customerId,
        status: "draft",
        default_tax_pct: 0,
        default_waste_pct: 10,
        created_by: null,
        created_at: now,
        updated_at: now,
        items: [],
      };
      setProjects((prev) => [...prev, project]);
      return project;
    },
    [],
  );

  const value = useMemo<StoreValue>(
    () => ({
      materials,
      vendors,
      customers,
      projects,
      addItemToProject,
      removeItemFromProject,
      updateProjectItem,
      createProject,
      getMaterialById,
      getVendorById,
      getCustomerById,
      getProjectById,
    }),
    [
      materials,
      vendors,
      customers,
      projects,
      addItemToProject,
      removeItemFromProject,
      updateProjectItem,
      createProject,
      getMaterialById,
      getVendorById,
      getCustomerById,
      getProjectById,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

/** Hook to access the prototype store. Throws if used outside provider. */
export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
