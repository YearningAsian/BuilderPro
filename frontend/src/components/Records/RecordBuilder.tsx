"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { ordersApi } from "@/services/api";
import type { Material, ProjectItem, SortConfig } from "@/types";

const ORDER_STATUS_STYLES: Record<ProjectItem["order_status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  ordered: "bg-sky-100 text-sky-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
};

// ─── Sub-components ──────────────────────────────────────────

/**
 * Material search dropdown: filters the catalog with debounce
 * and lets the user select a material to add.
 */
function MaterialSelector({
  onSelect,
}: {
  onSelect: (m: Material) => void;
}) {
  const { materials, getVendorById } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dq = useDebounce(query, 200);

  const filtered = useMemo(() => {
    if (!dq) return materials.slice(0, 8);
    const q = dq.toLowerCase();
    return materials
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.sku && m.sku.toLowerCase().includes(q)) ||
          (m.category && m.category.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [materials, dq]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Material
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-96 card shadow-xl z-20 animate-fade-in">
          <div className="p-3 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search materials…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400">No matches</li>
            ) : (
              filtered.map((m) => {
                const vendor = m.default_vendor_id
                  ? getVendorById(m.default_vendor_id)
                  : null;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(m);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.name}</p>
                        <p className="text-xs text-gray-400">
                          {m.category} · {m.sku ?? "No SKU"} · {vendor?.name ?? "—"}
                        </p>
                      </div>
                      <span className="text-sm font-mono text-gray-600 whitespace-nowrap">
                        {formatCurrency(m.unit_cost)}/{m.unit_type}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Inline-editable line item row.
 * Allows adjusting quantity, unit cost, and waste % directly.
 */
function RecordItemRow({
  item,
  projectId,
  index,
  isSelected,
  canSelectForPo,
  onToggleSelection,
}: {
  item: ProjectItem;
  projectId: string;
  index: number;
  isSelected: boolean;
  canSelectForPo: boolean;
  onToggleSelection: (itemId: string) => void;
}) {
  const { getMaterialById, updateProjectItem, removeItemFromProject } =
    useStore();
  const material = getMaterialById(item.material_id);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const purchasingMeta = [
    item.po_number ? `PO ${item.po_number}` : null,
    item.expected_delivery_at ? `ETA ${formatDate(item.expected_delivery_at)}` : null,
    material?.default_vendor_id ? "Vendor assigned" : "No vendor",
  ].filter(Boolean);

  useEffect(() => {
    setNotesDraft(item.notes ?? "");
  }, [item.notes]);

  const handleChange = useCallback(
    (field: "quantity" | "unit_cost" | "waste_pct", raw: string) => {
      const num = parseFloat(raw);
      if (Number.isNaN(num) || num < 0) return;
      updateProjectItem(projectId, item.id, { [field]: num });
    },
    [projectId, item.id, updateProjectItem],
  );

  const handleSaveNotes = useCallback(async () => {
    const normalizedNotes = notesDraft.trim();
    const nextNotes = normalizedNotes.length > 0 ? normalizedNotes : null;

    if ((item.notes ?? null) === nextNotes) {
      setIsNotesOpen(false);
      return;
    }

    setIsSavingNotes(true);
    try {
      await updateProjectItem(projectId, item.id, { notes: nextNotes });
      setIsNotesOpen(false);
    } finally {
      setIsSavingNotes(false);
    }
  }, [item.id, item.notes, notesDraft, projectId, updateProjectItem]);

  const handleCancelNotes = useCallback(() => {
    setNotesDraft(item.notes ?? "");
    setIsNotesOpen(false);
  }, [item.notes]);

  return (
    <>
      <tr className="group">
        <td>
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!canSelectForPo}
            onChange={() => onToggleSelection(item.id)}
            className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400 disabled:cursor-not-allowed"
            aria-label={`Select ${material?.name ?? "line item"} for purchase order`}
          />
        </td>
        <td className="text-gray-400 text-xs font-mono">{index + 1}</td>
        <td className="font-medium text-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              {material?.name ?? "Unknown"}
              {material?.sku && (
                <span className="ml-2 text-xs text-gray-400 font-mono">{material.sku}</span>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORDER_STATUS_STYLES[item.order_status]}`}>
                  {item.order_status}
                </span>
                {item.notes && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Notes
                  </span>
                )}
                {purchasingMeta.map((entry) => (
                  <span key={entry} className="text-[11px] text-gray-500">
                    {entry}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsNotesOpen((current) => !current)}
              className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              {isNotesOpen ? "Hide notes" : item.notes ? "Edit notes" : "Add notes"}
            </button>
          </div>
        </td>
        <td>
          <input
            type="number"
            min={0}
            step="any"
            value={item.quantity}
            onChange={(e) => handleChange("quantity", e.target.value)}
            className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:outline-none"
          />
        </td>
        <td className="text-gray-500 text-sm">{item.unit_type}</td>
        <td>
          <input
            type="number"
            min={0}
            step="0.01"
            value={item.unit_cost}
            onChange={(e) => handleChange("unit_cost", e.target.value)}
            className="w-24 px-2 py-1 text-sm border border-gray-200 rounded font-mono focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:outline-none"
          />
        </td>
        <td>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={item.waste_pct}
            onChange={(e) => handleChange("waste_pct", e.target.value)}
            className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:outline-none"
          />
        </td>
        <td className="font-mono text-sm text-gray-600">
          {item.total_qty.toFixed(2)}
        </td>
        <td className="font-mono text-sm font-semibold text-gray-900">
          {formatCurrency(item.line_subtotal)}
        </td>
        <td>
          <button
            type="button"
            onClick={() => removeItemFromProject(projectId, item.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1"
            title="Remove item"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      </tr>
      {isNotesOpen && (
        <tr className="bg-amber-50/40">
          <td colSpan={10} className="px-4 py-3">
            <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-3">
              <label className="block space-y-1 text-sm text-gray-700">
                <span className="font-medium">Line item notes</span>
                <textarea
                  rows={3}
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Add install notes, sequencing, field measurements, or handoff details"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveNotes()}
                  disabled={isSavingNotes}
                  className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {isSavingNotes ? "Saving..." : "Save notes"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelNotes}
                  disabled={isSavingNotes}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Sort helper types ───────────────────────────────────────
type ItemSortKey = "name" | "quantity" | "unit_cost" | "line_subtotal";

// ─── Main component ──────────────────────────────────────────

/**
 * RecordBuilder — the core record editing experience.
 *
 * Features:
 *  - Add materials from a searchable dropdown
 *  - Inline-edit quantity, cost, waste % per line
 *  - Passive cost estimation recalculated on every change
 *  - Sort line items by column
 *  - Remove items
 */
export function RecordBuilder({ projectId }: { projectId: string }) {
  const { getProjectById, getMaterialById, getVendorById, addItemToProject, refreshData } = useStore();
  const project = getProjectById(projectId);

  const [sort, setSort] = useState<SortConfig<ItemSortKey> | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [poNumber, setPoNumber] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poEta, setPoEta] = useState("");
  const [poCarrier, setPoCarrier] = useState("");
  const [poTrackingNumber, setPoTrackingNumber] = useState("");
  const [poTrackingUrl, setPoTrackingUrl] = useState("");
  const [poError, setPoError] = useState("");
  const [poStatus, setPoStatus] = useState("");
  const [isCreatingPo, setIsCreatingPo] = useState(false);

  const toggleSort = useCallback((key: ItemSortKey) => {
    setSort((prev) => {
      if (prev?.key === key)
        return prev.direction === "asc" ? { key, direction: "desc" } : null;
      return { key, direction: "asc" };
    });
  }, []);

  /** Add a material with default qty=1. */
  const handleAdd = useCallback(
    (material: Material) => {
      addItemToProject(projectId, material, 1);
    },
    [projectId, addItemToProject],
  );

  /** Sorted items list. */
  const sortedItems = useMemo(() => {
    if (!project) return [];
    const items = [...project.items];
    if (!sort) return items;

    return items.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sort.key === "name") {
        av = getMaterialById(a.material_id)?.name ?? "";
        bv = getMaterialById(b.material_id)?.name ?? "";
      } else {
        av = a[sort.key];
        bv = b[sort.key];
      }
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [project, sort, getMaterialById]);

  useEffect(() => {
    const currentIds = new Set((project?.items ?? []).map((item) => item.id));
    setSelectedItemIds((prev) => prev.filter((itemId) => currentIds.has(itemId)));
  }, [project?.items]);

  const selectedItems = useMemo(
    () => sortedItems.filter((item) => selectedItemIds.includes(item.id)),
    [selectedItemIds, sortedItems],
  );

  const selectedMaterials = useMemo(
    () =>
      selectedItems.map((item) => ({
        item,
        material: getMaterialById(item.material_id),
      })),
    [getMaterialById, selectedItems],
  );

  const selectedVendorIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedMaterials
            .map((entry) => entry.material?.default_vendor_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [selectedMaterials],
  );

  const selectedVendor = selectedVendorIds.length === 1 ? getVendorById(selectedVendorIds[0]) : null;
  const canCreatePo =
    Boolean(project?.status === "active") &&
    selectedItems.length > 0 &&
    selectedVendorIds.length === 1 &&
    selectedItems.every((item) => item.order_status === "draft" && !item.po_number);

  const procurementSnapshot = useMemo(() => {
    const totalReady = sortedItems.filter((item) => {
      const material = getMaterialById(item.material_id);
      return item.order_status === "draft" && !item.po_number && Boolean(material?.default_vendor_id);
    }).length;
    const withoutVendor = sortedItems.filter((item) => {
      const material = getMaterialById(item.material_id);
      return !material?.default_vendor_id;
    }).length;
    return { totalReady, withoutVendor };
  }, [getMaterialById, sortedItems]);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((entry) => entry !== itemId) : [...prev, itemId],
    );
  }, []);

  const clearPoForm = useCallback(() => {
    setSelectedItemIds([]);
    setPoNumber("");
    setPoNotes("");
    setPoEta("");
    setPoCarrier("");
    setPoTrackingNumber("");
    setPoTrackingUrl("");
  }, []);

  const toIsoOrNull = useCallback((value: string): string | null => {
    if (!value.trim()) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }, []);

  const createPurchaseOrderFromSelection = useCallback(async () => {
    setPoError("");
    setPoStatus("");

    if (!canCreatePo || !selectedVendor) {
      setPoError("Select draft line items from a single assigned vendor on an active project.");
      return;
    }

    const normalizedPoNumber = poNumber.trim();
    if (!normalizedPoNumber) {
      setPoError("PO number is required.");
      return;
    }

    setIsCreatingPo(true);
    try {
      await ordersApi.createPurchaseOrder({
        vendor_id: selectedVendor.id,
        po_number: normalizedPoNumber,
        item_ids: selectedItems.map((item) => item.id),
        purchase_notes: poNotes.trim() || null,
        expected_delivery_at: toIsoOrNull(poEta),
        carrier: poCarrier.trim() || null,
        tracking_number: poTrackingNumber.trim() || null,
        tracking_url: poTrackingUrl.trim() || null,
      });
      await refreshData();
      setPoStatus(`Created ${normalizedPoNumber} for ${selectedVendor.name}.`);
      clearPoForm();
    } catch (error) {
      setPoError(error instanceof Error ? error.message : "Unable to create purchase order.");
    } finally {
      setIsCreatingPo(false);
    }
  }, [
    canCreatePo,
    clearPoForm,
    poCarrier,
    poEta,
    poNotes,
    poNumber,
    poTrackingNumber,
    poTrackingUrl,
    refreshData,
    selectedItems,
    selectedVendor,
    toIsoOrNull,
  ]);

  // ── Cost summary (passive estimation) ──
  const summary = useMemo(() => {
    if (!project) return { subtotal: 0, wasteCost: 0, taxAmount: 0, total: 0 };
    const subtotal = project.items.reduce((s, i) => s + i.line_subtotal, 0);
    // Waste cost is already baked into line_subtotal via total_qty,
    // so we calculate just the tax layer here.
    const taxRate = project.default_tax_pct / 100;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;
    return { subtotal, wasteCost: 0, taxAmount, total };
  }, [project]);

  if (!project) {
    return (
      <div className="p-8 text-center text-gray-400">
        Project not found.
      </div>
    );
  }

  const sortArrow = (key: ItemSortKey) =>
    sort?.key === key ? (sort.direction === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            {project.items.length} line item{project.items.length !== 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Purchasing details stay visible here while you edit the estimate.
          </p>
        </div>
        <MaterialSelector onSelect={handleAdd} />
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Create Purchase Order</h3>
            <p className="mt-1 text-sm text-gray-600">
              Select draft lines with the same vendor, assign a PO number, and push them into purchasing without leaving the project.
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {procurementSnapshot.totalReady} ready · {procurementSnapshot.withoutVendor} missing vendor
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected lines</p>
            <p className="mt-2 text-lg font-semibold text-gray-900">{selectedItems.length}</p>
            <p className="text-sm text-gray-500">
              {selectedVendor ? selectedVendor.name : selectedItemIds.length > 0 ? "Mixed or missing vendor" : "No selection"}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selected subtotal</p>
            <p className="mt-2 text-lg font-semibold text-gray-900">
              {formatCurrency(selectedItems.reduce((sum, item) => sum + item.line_subtotal, 0))}
            </p>
            <p className="text-sm text-gray-500">Current selection total</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Project status</p>
            <p className="mt-2 text-lg font-semibold text-gray-900">{project.status}</p>
            <p className="text-sm text-gray-500">PO creation requires an active project</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">PO number</span>
            <input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Expected delivery</span>
            <input type="datetime-local" value={poEta} onChange={(event) => setPoEta(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Carrier</span>
            <input value={poCarrier} onChange={(event) => setPoCarrier(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Tracking number</span>
            <input value={poTrackingNumber} onChange={(event) => setPoTrackingNumber(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-sm text-gray-600 md:col-span-2 xl:col-span-1">
            <span className="font-medium text-gray-700">Tracking URL</span>
            <input value={poTrackingUrl} onChange={(event) => setPoTrackingUrl(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1 text-sm text-gray-600 md:col-span-2 xl:col-span-3">
            <span className="font-medium text-gray-700">PO notes</span>
            <textarea rows={3} value={poNotes} onChange={(event) => setPoNotes(event.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>
        </div>

        {poError && <p className="text-sm text-red-600">{poError}</p>}
        {poStatus && <p className="text-sm text-green-700">{poStatus}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void createPurchaseOrderFromSelection()}
            disabled={!canCreatePo || isCreatingPo}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingPo ? "Creating PO..." : "Create PO from selected lines"}
          </button>
          <button
            type="button"
            onClick={clearPoForm}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
          >
            Clear selection
          </button>
        </div>
      </div>

      {/* Items table */}
      <div className="card overflow-x-auto">
        <table className="bp-table">
          <thead>
            <tr>
              <th className="w-10"></th>
              <th className="w-10">#</th>
              <th className="cursor-pointer" onClick={() => toggleSort("name")}>
                Material{sortArrow("name") && <span className="text-orange-500">{sortArrow("name")}</span>}
              </th>
              <th className="cursor-pointer" onClick={() => toggleSort("quantity")}>
                Qty{sortArrow("quantity") && <span className="text-orange-500">{sortArrow("quantity")}</span>}
              </th>
              <th>Unit</th>
              <th className="cursor-pointer" onClick={() => toggleSort("unit_cost")}>
                Unit Cost{sortArrow("unit_cost") && <span className="text-orange-500">{sortArrow("unit_cost")}</span>}
              </th>
              <th>Waste %</th>
              <th>Total Qty</th>
              <th className="cursor-pointer text-right" onClick={() => toggleSort("line_subtotal")}>
                Subtotal{sortArrow("line_subtotal") && <span className="text-orange-500">{sortArrow("line_subtotal")}</span>}
              </th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-gray-400">
                  No items yet — click <strong>Add Material</strong> to start building your estimate.
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => (
                <RecordItemRow
                  key={item.id}
                  item={item}
                  projectId={projectId}
                  index={idx}
                  isSelected={selectedItemIds.includes(item.id)}
                  canSelectForPo={project.status === "active" && item.order_status === "draft" && !item.po_number}
                  onToggleSelection={toggleItemSelection}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Passive cost estimation summary panel ── */}
      <div className="card p-5 max-w-sm ml-auto space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Estimate Summary
        </h3>
        <div className="flex justify-between text-sm text-gray-700">
          <span>Subtotal (incl. waste)</span>
          <span className="font-mono">{formatCurrency(summary.subtotal)}</span>
        </div>
        {project.default_tax_pct > 0 && (
          <div className="flex justify-between text-sm text-gray-700">
            <span>Tax ({formatPercent(project.default_tax_pct)})</span>
            <span className="font-mono">{formatCurrency(summary.taxAmount)}</span>
          </div>
        )}
        <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-bold text-gray-900">
          <span>Total</span>
          <span className="font-mono">{formatCurrency(summary.total)}</span>
        </div>
      </div>
    </div>
  );
}
