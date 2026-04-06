/**
 * Central app store backed by the live FastAPI API.
 *
 * It preserves the same component-facing interface as the earlier
 * prototype store while syncing reads and mutations to the backend.
 */
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Material,
  MaterialCreate,
  Vendor,
  Customer,
  Project,
  ProjectItem,
} from "@/types";
import {
  SEED_CUSTOMERS,
  SEED_MATERIALS,
  SEED_PROJECTS,
  SEED_VENDORS,
} from "@/data/seed";
import {
  customersApi,
  materialsApi,
  projectItemsApi,
  projectsApi,
  vendorsApi,
} from "@/services/api";

interface StoreValue {
  materials: Material[];
  vendors: Vendor[];
  customers: Customer[];
  projects: Project[];
  isLoading: boolean;
  refreshData: () => Promise<void>;

  addItemToProject: (
    projectId: string,
    material: Material,
    quantity: number,
    wastePctOverride?: number,
    unitCostOverride?: number,
  ) => Promise<ProjectItem | null>;

  removeItemFromProject: (projectId: string, itemId: string) => Promise<void>;

  updateProjectItem: (
    projectId: string,
    itemId: string,
    patch: Partial<Pick<ProjectItem, "quantity" | "waste_pct" | "unit_cost" | "notes">>,
  ) => Promise<void>;

  createProject: (name: string, customerId: string) => Promise<Project | null>;
  createMaterial: (data: MaterialCreate) => Promise<Material>;
  updateMaterial: (id: string, data: Partial<MaterialCreate>) => Promise<Material>;
  deleteMaterial: (id: string) => Promise<void>;

  getMaterialById: (id: string) => Material | undefined;
  getVendorById: (id: string) => Vendor | undefined;
  getCustomerById: (id: string) => Customer | undefined;
  getProjectById: (id: string) => Project | undefined;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const applySnapshot = useCallback((snapshot: {
    materials: Material[];
    vendors: Vendor[];
    customers: Customer[];
    projects: Project[];
  }) => {
    setMaterials(snapshot.materials);
    setVendors(snapshot.vendors);
    setCustomers(snapshot.customers);
    setProjects(snapshot.projects);
  }, []);

  const refreshData = useCallback(async () => {
    const [nextMaterials, nextVendors, nextCustomers, nextProjects] = await Promise.all([
      materialsApi.list(),
      vendorsApi.list(),
      customersApi.list(),
      projectsApi.list(),
    ]);

    applySnapshot({
      materials: nextMaterials,
      vendors: nextVendors,
      customers: nextCustomers,
      projects: nextProjects,
    });
  }, [applySnapshot]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setIsLoading(true);
      try {
        const [nextMaterials, nextVendors, nextCustomers, nextProjects] = await Promise.all([
          materialsApi.list(),
          vendorsApi.list(),
          customersApi.list(),
          projectsApi.list(),
        ]);

        if (!active) return;

        applySnapshot({
          materials: nextMaterials,
          vendors: nextVendors,
          customers: nextCustomers,
          projects: nextProjects,
        });
      } catch (error) {
        console.warn("BuilderPro live sync failed; showing local fallback data.", error);
        if (!active) return;

        applySnapshot({
          materials: SEED_MATERIALS,
          vendors: SEED_VENDORS,
          customers: SEED_CUSTOMERS,
          projects: SEED_PROJECTS,
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [applySnapshot]);

  const getMaterialById = useCallback(
    (id: string) => materials.find((material) => material.id === id),
    [materials],
  );

  const getVendorById = useCallback(
    (id: string) => vendors.find((vendor) => vendor.id === id),
    [vendors],
  );

  const getCustomerById = useCallback(
    (id: string) => customers.find((customer) => customer.id === id),
    [customers],
  );

  const getProjectById = useCallback(
    (id: string) => projects.find((project) => project.id === id),
    [projects],
  );

  const addItemToProject = useCallback(
    async (
      projectId: string,
      material: Material,
      quantity: number,
      wastePctOverride?: number,
      unitCostOverride?: number,
    ) => {
      const created = await projectItemsApi.create(projectId, {
        material_id: material.id,
        quantity,
        unit_type: material.unit_type,
        unit_cost: unitCostOverride ?? material.unit_cost,
        waste_pct: wastePctOverride ?? material.default_waste_pct,
        notes: null,
      });

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: [...project.items, created],
                updated_at: created.updated_at,
              }
            : project,
        ),
      );

      return created;
    },
    [],
  );

  const removeItemFromProject = useCallback(
    async (projectId: string, itemId: string) => {
      await projectItemsApi.delete(projectId, itemId);

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: project.items.filter((item) => item.id !== itemId),
                updated_at: new Date().toISOString(),
              }
            : project,
        ),
      );
    },
    [],
  );

  const updateProjectItem = useCallback(
    async (
      projectId: string,
      itemId: string,
      patch: Partial<Pick<ProjectItem, "quantity" | "waste_pct" | "unit_cost" | "notes">>,
    ) => {
      const updated = await projectItemsApi.update(projectId, itemId, patch);

      setProjects((prev) =>
        prev.map((project) => {
          if (project.id !== projectId) return project;

          return {
            ...project,
            updated_at: updated.updated_at,
            items: project.items.map((item) => (item.id === itemId ? updated : item)),
          };
        }),
      );
    },
    [],
  );

  const createProject = useCallback(
    async (name: string, customerId: string) => {
      const created = await projectsApi.create({
        name,
        customer_id: customerId,
      });

      setProjects((prev) => [...prev, { ...created, items: created.items ?? [] }]);
      return created;
    },
    [],
  );

  const createMaterial = useCallback(async (data: MaterialCreate) => {
    const created = await materialsApi.create(data);
    setMaterials((prev) => [...prev, created]);
    return created;
  }, []);

  const updateMaterial = useCallback(async (id: string, data: Partial<MaterialCreate>) => {
    const updated = await materialsApi.update(id, data);
    setMaterials((prev) => prev.map((material) => (material.id === id ? updated : material)));
    return updated;
  }, []);

  const deleteMaterial = useCallback(async (id: string) => {
    await materialsApi.delete(id);
    setMaterials((prev) => prev.filter((material) => material.id !== id));
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      materials,
      vendors,
      customers,
      projects,
      isLoading,
      refreshData,
      addItemToProject,
      removeItemFromProject,
      updateProjectItem,
      createProject,
      createMaterial,
      updateMaterial,
      deleteMaterial,
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
      isLoading,
      refreshData,
      addItemToProject,
      removeItemFromProject,
      updateProjectItem,
      createProject,
      createMaterial,
      updateMaterial,
      deleteMaterial,
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

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
