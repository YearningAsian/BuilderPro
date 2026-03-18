"use client";

import { useCallback, useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Material, ProjectItem, SortConfig } from "@/types";

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
}: {
  item: ProjectItem;
  projectId: string;
  index: number;
}) {
  const { getMaterialById, updateProjectItem, removeItemFromProject } =
    useStore();
  const material = getMaterialById(item.material_id);

  const handleChange = useCallback(
    (field: "quantity" | "unit_cost" | "waste_pct", raw: string) => {
      const num = parseFloat(raw);
      if (Number.isNaN(num) || num < 0) return;
      updateProjectItem(projectId, item.id, { [field]: num });
    },
    [projectId, item.id, updateProjectItem],
  );

  return (
    <tr className="group">
      <td className="text-gray-400 text-xs font-mono">{index + 1}</td>
      <td className="font-medium text-gray-900">
        {material?.name ?? "Unknown"}
        {material?.sku && (
          <span className="ml-2 text-xs text-gray-400 font-mono">{material.sku}</span>
        )}
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
  const { getProjectById, getMaterialById, addItemToProject } = useStore();
  const project = getProjectById(projectId);

  const [sort, setSort] = useState<SortConfig<ItemSortKey> | null>(null);

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
        </div>
        <MaterialSelector onSelect={handleAdd} />
      </div>

      {/* Items table */}
      <div className="card overflow-x-auto">
        <table className="bp-table">
          <thead>
            <tr>
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
                <td colSpan={9} className="text-center py-12 text-gray-400">
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
