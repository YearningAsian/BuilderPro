"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MATERIAL_CATEGORIES } from "@/data/seed";
import { useDebounce } from "@/hooks/useDebounce";
import { useStore } from "@/hooks/useStore";
import { getActiveSession } from "@/lib/auth";
import { formatCurrency, formatPercent } from "@/lib/format";
import { materialsApi } from "@/services/api";
import type {
  Material,
  MaterialAttachment,
  MaterialCreate,
  MaterialPriceHistoryEntry,
  SortConfig,
} from "@/types";
import { materialCreateSchema } from "@/types/schemas";

type MaterialSortKey = "name" | "category" | "unit_type" | "unit_cost" | "sku";

type MaterialFormState = {
  name: string;
  category: string;
  unit_type: string;
  unit_cost: string;
  sku: string;
  default_vendor_id: string;
  size_dims: string;
  notes: string;
  is_taxable: boolean;
  default_waste_pct: string;
};

const UNIT_TYPE_OPTIONS = ["each", "ft", "sqft", "cuyd", "lb", "box", "sheet", "roll"];

const EMPTY_FORM: MaterialFormState = {
  name: "",
  category: "",
  unit_type: "each",
  unit_cost: "0",
  sku: "",
  default_vendor_id: "",
  size_dims: "",
  notes: "",
  is_taxable: true,
  default_waste_pct: "0",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
}

function toFormState(material?: Material | null): MaterialFormState {
  if (!material) return EMPTY_FORM;

  return {
    name: material.name,
    category: material.category ?? "",
    unit_type: material.unit_type,
    unit_cost: String(material.unit_cost),
    sku: material.sku ?? "",
    default_vendor_id: material.default_vendor_id ?? "",
    size_dims: material.size_dims ?? "",
    notes: material.notes ?? "",
    is_taxable: material.is_taxable,
    default_waste_pct: String(material.default_waste_pct),
  };
}

function SortHeader({
  label,
  sortKey,
  active,
  onClick,
}: {
  label: string;
  sortKey: MaterialSortKey;
  active: SortConfig<MaterialSortKey> | null;
  onClick: (key: MaterialSortKey) => void;
}) {
  const arrow =
    active?.key === sortKey ? (active.direction === "asc" ? " ▲" : " ▼") : "";

  return (
    <th
      className="cursor-pointer select-none hover:text-gray-700 transition-colors"
      onClick={() => onClick(sortKey)}
    >
      {label}
      <span className="text-orange-500">{arrow}</span>
    </th>
  );
}

export function MaterialsList() {
  const {
    materials,
    vendors,
    getVendorById,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    refreshData,
  } = useStore();

  const [sessionRole, setSessionRole] = useState<"admin" | "user" | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [vendorFilter, setVendorFilter] = useState("");
  const [sort, setSort] = useState<SortConfig<MaterialSortKey> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [form, setForm] = useState<MaterialFormState>(EMPTY_FORM);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingPriceHistory, setIsLoadingPriceHistory] = useState(false);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [priceHistory, setPriceHistory] = useState<MaterialPriceHistoryEntry[]>([]);
  const [attachments, setAttachments] = useState<MaterialAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQuery = useDebounce(query, 250);
  const isAdmin = sessionRole === "admin";
  const selectedMaterial = useMemo(
    () => (selectedMaterialId ? materials.find((material) => material.id === selectedMaterialId) ?? null : null),
    [materials, selectedMaterialId],
  );

  useEffect(() => {
    setSessionRole(getActiveSession()?.role ?? null);
  }, []);

  useEffect(() => {
    if (!selectedMaterialId) {
      setPriceHistory([]);
      setAttachments([]);
      setAttachmentName("");
      setAttachmentFile(null);
      return;
    }

    let active = true;
    setFormError("");

    const loadMaterialDetailData = async () => {
      setIsLoadingPriceHistory(true);
      setIsLoadingAttachments(true);
      try {
        const [nextHistory, nextAttachments] = await Promise.all([
          materialsApi.listPriceHistory(selectedMaterialId, 50),
          materialsApi.listAttachments(selectedMaterialId),
        ]);

        if (!active) return;
        setPriceHistory(nextHistory);
        setAttachments(nextAttachments);
      } catch (error) {
        if (!active) return;
        setFormError(error instanceof Error ? error.message : "Unable to load material history.");
      } finally {
        if (active) {
          setIsLoadingPriceHistory(false);
          setIsLoadingAttachments(false);
        }
      }
    };

    void loadMaterialDetailData();

    return () => {
      active = false;
    };
  }, [selectedMaterialId]);

  const toggleSort = useCallback((key: MaterialSortKey) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.direction === "asc" ? { key, direction: "desc" } : null;
      }
      return { key, direction: "asc" };
    });
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();

    let list = materials.filter((material) => {
      const vendorName = material.default_vendor_id
        ? getVendorById(material.default_vendor_id)?.name ?? ""
        : "";

      const matchesQuery =
        !q ||
        material.name.toLowerCase().includes(q) ||
        (material.sku && material.sku.toLowerCase().includes(q)) ||
        (material.category && material.category.toLowerCase().includes(q)) ||
        vendorName.toLowerCase().includes(q);

      const matchesCategory = !categoryFilter || material.category === categoryFilter;
      const matchesVendor = !vendorFilter || material.default_vendor_id === vendorFilter;

      return matchesQuery && matchesCategory && matchesVendor;
    });

    if (sort) {
      list = [...list].sort((a, b) => {
        const av = a[sort.key] ?? "";
        const bv = b[sort.key] ?? "";
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sort.direction === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [materials, debouncedQuery, categoryFilter, vendorFilter, sort, getVendorById]);

  const averageUnitCost = useMemo(() => {
    if (materials.length === 0) return 0;
    return materials.reduce((sum, material) => sum + material.unit_cost, 0) / materials.length;
  }, [materials]);

  const categoriesInUse = useMemo(() => {
    return new Set(materials.map((material) => material.category).filter(Boolean)).size;
  }, [materials]);

  const openCreateForm = () => {
    setEditingMaterialId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormStatus("");
    setIsEditorOpen(true);
  };

  const openEditForm = (material: Material) => {
    setEditingMaterialId(material.id);
    setForm(toFormState(material));
    setFormError("");
    setFormStatus("");
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setEditingMaterialId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setIsEditorOpen(false);
  };

  const handleFieldChange = <K extends keyof MaterialFormState>(key: K, value: MaterialFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormStatus("");

    const candidate: MaterialCreate = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit_type: form.unit_type.trim(),
      unit_cost: Number(form.unit_cost),
      sku: form.sku.trim() || null,
      default_vendor_id: form.default_vendor_id || null,
      size_dims: form.size_dims.trim() || null,
      notes: form.notes.trim() || null,
      is_taxable: form.is_taxable,
      default_waste_pct: Number(form.default_waste_pct),
    };

    const validated = materialCreateSchema.safeParse(candidate);
    if (!validated.success) {
      setFormError(validated.error.issues[0]?.message ?? "Please correct the material details.");
      return;
    }

    setIsSaving(true);

    try {
      if (editingMaterialId) {
        await updateMaterial(editingMaterialId, validated.data);
        setFormStatus("Material updated successfully.");
      } else {
        await createMaterial(validated.data);
        setFormStatus("Material created successfully.");
        setForm(EMPTY_FORM);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save material.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (material: Material) => {
    const confirmed = window.confirm(
      `Delete ${material.name}? This only works if the material is not already used in a project.`
    );
    if (!confirmed) return;

    setFormError("");
    setFormStatus("");

    try {
      await deleteMaterial(material.id);
      setFormStatus(`${material.name} was removed from the catalog.`);
      if (editingMaterialId === material.id) {
        closeEditor();
      }
      if (selectedMaterialId === material.id) {
        setSelectedMaterialId(null);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to delete material.");
    }
  };

  const triggerImportPicker = () => {
    fileInputRef.current?.click();
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setFormError("");
    setFormStatus("");
    setIsImporting(true);

    try {
      const summary = await materialsApi.importCsv(file);
      await refreshData();

      const headline = `CSV import complete: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped.`;
      if (summary.errors.length > 0) {
        const preview = summary.errors.slice(0, 3).map((entry) => `Row ${entry.row}: ${entry.message}`).join(" ");
        setFormError(`${headline} ${preview}`);
      } else {
        setFormStatus(headline);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to import CSV.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddAttachment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMaterial || !attachmentFile) {
      setFormError("Select a file before uploading an attachment.");
      return;
    }

    setFormError("");
    setFormStatus("");

    try {
      const created = await materialsApi.uploadAttachment(
        selectedMaterial.id,
        attachmentFile,
        attachmentName.trim() || undefined,
      );
      setAttachments((prev) => [created, ...prev]);
      setAttachmentName("");
      setAttachmentFile(null);
      setFormStatus("Attachment added.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add attachment.");
    }
  };

  const handleDeleteAttachment = async (attachment: MaterialAttachment) => {
    if (!selectedMaterial) return;

    const confirmed = window.confirm(`Remove attachment ${attachment.name}?`);
    if (!confirmed) return;

    setFormError("");
    setFormStatus("");

    try {
      await materialsApi.deleteAttachment(selectedMaterial.id, attachment.id);
      setAttachments((prev) => prev.filter((entry) => entry.id !== attachment.id));
      setFormStatus("Attachment removed.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to remove attachment.");
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materials Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">
            Maintain your reusable pricebook for estimates, vendors, and job costing.
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={triggerImportPicker}
              disabled={isImporting}
              className="rounded-lg border border-orange-300 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-70"
            >
              {isImporting ? "Importing CSV..." : "Import CSV"}
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Add material
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Catalog size</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{materials.length}</p>
          <p className="text-sm text-gray-500">Active materials in the pricebook</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{categoriesInUse}</p>
          <p className="text-sm text-gray-500">Material groups currently in use</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Average unit cost</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(averageUnitCost)}</p>
          <p className="text-sm text-gray-500">Quick cost pulse across the catalog</p>
        </div>
      </div>

      <div className="card p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.65 4.65a7.5 7.5 0 016 12"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, SKU, category, or vendor…"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
            />
          </div>

          <select
            value={vendorFilter}
            onChange={(event) => setVendorFilter(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !categoryFilter
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
            }`}
          >
            All
          </button>
          {MATERIAL_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setCategoryFilter(category === categoryFilter ? null : category)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                categoryFilter === category
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {(formError || formStatus) && (
        <div className="space-y-2">
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
          {formStatus && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {formStatus}
            </p>
          )}
        </div>
      )}

      {isAdmin && isEditorOpen && (
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {editingMaterialId ? "Edit material" : "Create material"}
              </h2>
              <p className="text-sm text-gray-600">
                Set pricing defaults and vendor information for your estimating catalog.
              </p>
            </div>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(event) => handleFieldChange("name", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
                placeholder="2x4 kiln-dried stud"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(event) => handleFieldChange("category", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
              >
                <option value="">Select category</option>
                {MATERIAL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Unit type</label>
              <select
                value={form.unit_type}
                onChange={(event) => handleFieldChange("unit_type", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
              >
                {UNIT_TYPE_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Unit cost</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.unit_cost}
                onChange={(event) => handleFieldChange("unit_cost", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">SKU</label>
              <input
                value={form.sku}
                onChange={(event) => handleFieldChange("sku", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
                placeholder="LMB-2X4-8"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Preferred vendor</label>
              <select
                value={form.default_vendor_id}
                onChange={(event) => handleFieldChange("default_vendor_id", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
              >
                <option value="">No default vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Size / dimensions</label>
              <input
                value={form.size_dims}
                onChange={(event) => handleFieldChange("size_dims", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
                placeholder="8 ft x 2 in x 4 in"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Default waste %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.default_waste_pct}
                onChange={(event) => handleFieldChange("default_waste_pct", event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-800 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(event) => handleFieldChange("notes", event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
                placeholder="Specs, alternates, ordering notes, or color details"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_taxable}
                onChange={(event) => handleFieldChange("is_taxable", event.target.checked)}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-300"
              />
              Taxable item
            </label>

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-300"
              >
                {isSaving ? "Saving..." : editingMaterialId ? "Save changes" : "Create material"}
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Showing {filtered.length} of {materials.length} materials
      </p>

      <div className="card overflow-x-auto">
        <table className="bp-table">
          <thead>
            <tr>
              <SortHeader label="Name" sortKey="name" active={sort} onClick={toggleSort} />
              <SortHeader label="Category" sortKey="category" active={sort} onClick={toggleSort} />
              <SortHeader label="Unit Type" sortKey="unit_type" active={sort} onClick={toggleSort} />
              <SortHeader label="Unit Cost" sortKey="unit_cost" active={sort} onClick={toggleSort} />
              <SortHeader label="SKU" sortKey="sku" active={sort} onClick={toggleSort} />
              <th>Vendor</th>
              <th>Waste %</th>
              <th>Taxable</th>
              <th>Updated</th>
              <th>Details</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 11 : 10} className="text-center py-10 text-gray-400">
                  No materials match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((material) => {
                const vendor = material.default_vendor_id
                  ? getVendorById(material.default_vendor_id)
                  : null;

                return (
                  <tr key={material.id}>
                    <td className="font-medium text-gray-900">{material.name}</td>
                    <td>
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                        {material.category ?? "—"}
                      </span>
                    </td>
                    <td>{material.unit_type}</td>
                    <td className="font-mono">{formatCurrency(material.unit_cost)}</td>
                    <td className="font-mono text-gray-500">{material.sku ?? "—"}</td>
                    <td className="text-gray-600">{vendor?.name ?? "—"}</td>
                    <td>{formatPercent(material.default_waste_pct)}</td>
                    <td>
                      {material.is_taxable ? (
                        <span className="text-green-600 text-xs font-semibold">Yes</span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="text-xs text-gray-500">{formatDateTime(material.updated_at)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedMaterialId(material.id)}
                        className="rounded-md border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                      >
                        View
                      </button>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(material)}
                            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(material)}
                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedMaterial && (
        <section className="card p-5 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedMaterial.name} details</h2>
              <p className="text-sm text-gray-600">
                Track recent price updates and keep reference links for this material.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMaterialId(null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Price history</h3>
              {isLoadingPriceHistory ? (
                <p className="text-sm text-gray-500">Loading price history...</p>
              ) : priceHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No tracked price changes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {priceHistory.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                      <p className="font-medium text-gray-900">
                        {formatCurrency(entry.new_unit_cost)}
                        {entry.previous_unit_cost !== null && (
                          <span className="ml-2 text-gray-500">
                            (from {formatCurrency(entry.previous_unit_cost)})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(entry.changed_at)}
                        {entry.source ? ` • ${entry.source}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Attachments</h3>
              {isAdmin && (
                <form className="grid gap-2" onSubmit={handleAddAttachment}>
                  <input
                    value={attachmentName}
                    onChange={(event) => setAttachmentName(event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Optional display name"
                  />
                  <input
                    type="file"
                    onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                    aria-label="Attachment file"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
                  >
                    Upload attachment
                  </button>
                </form>
              )}

              {isLoadingAttachments ? (
                <p className="text-sm text-gray-500">Loading attachments...</p>
              ) : attachments.length === 0 ? (
                <p className="text-sm text-gray-500">No attachments yet.</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((attachment) => (
                    <li key={attachment.id} className="rounded-md border border-gray-100 bg-gray-50 p-3 text-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-orange-700 hover:underline"
                          >
                            {attachment.name}
                          </a>
                          <p className="text-xs text-gray-500">
                            {formatDateTime(attachment.uploaded_at)}
                            {attachment.size_bytes !== null ? ` • ${attachment.size_bytes} bytes` : ""}
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(attachment)}
                            className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
