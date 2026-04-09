"use client";

import { useCallback, useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { formatCurrency } from "@/lib/format";
import type { Material, ProjectItem } from "@/types";

interface Props {
  projectId: string;
}

type SortKey = "name" | "category" | "unit_cost" | "unit_type";

/**
 * RecordBuilder — bill-of-materials editor for a project.
 *
 * Left panel: searchable/sortable materials catalog
 * Right panel: current line items with qty/waste controls + live cost total
 */
export function RecordBuilder({ projectId }: Props) {
  const {
    materials,
    getProjectById,
    addItemToProject,
    removeItemFromProject,
    updateProjectItem,
  } = useStore();

  const project = getProjectById(projectId);

  // ── Catalog search + sort ──
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(materials.map((m) => m.category).filter(Boolean))
    ) as string[];
    return ["all", ...cats.sort()];
  }, [materials]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const filteredMaterials = useMemo(() => {
    let list = materials.filter((m) => {
      const matchSearch =
        !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.category?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchCat =
        categoryFilter === "all" || m.category === categoryFilter;
      return matchSearch && matchCat;
    });

    list = [...list].sort((a, b) => {
      const av = sortKey === "unit_cost" ? a.unit_cost : String(a[sortKey] ?? "");
      const bv = sortKey === "unit_cost" ? b.unit_cost : String(b[sortKey] ?? "");
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [materials, search, categoryFilter, sortKey, sortDir]);

  // ── Add item ──
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});

  const handleAdd = useCallback(
    (material: Material) => {
      const raw = qtyInputs[material.id];
      const qty = raw ? parseFloat(raw) : 1;
      if (!qty || qty <= 0) return;
      addItemToProject(projectId, material, qty);
      setQtyInputs((prev) => ({ ...prev, [material.id]: "" }));
    },
    [projectId, qtyInputs, addItemToProject]
  );

  // ── Line item updates ──
  const handleQtyChange = useCallback(
    (itemId: string, value: string) => {
      const qty = parseFloat(value);
      if (!isNaN(qty) && qty > 0) {
        updateProjectItem(projectId, itemId, { quantity: qty });
      }
    },
    [projectId, updateProjectItem]
  );

  const handleWasteChange = useCallback(
    (itemId: string, value: string) => {
      const waste = parseFloat(value);
      if (!isNaN(waste) && waste >= 0) {
        updateProjectItem(projectId, itemId, { waste_pct: waste });
      }
    },
    [projectId, updateProjectItem]
  );

  // ── Cost summary ──
  const items = project?.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.line_subtotal, 0);
  const taxPct = project?.default_tax_pct ?? 0;
  const taxAmount = subtotal * (taxPct / 100);
  const grandTotal = subtotal + taxAmount;

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (!project) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

      {/* ── LEFT: Material catalog ── */}
      <div className="card flex flex-col overflow-hidden">
        {/* Catalog header */}
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Material Catalog
          </h3>

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.65 4.65a7.5 7.5 0 016 12" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </option>
            ))}
          </select>
        </div>

        {/* Catalog table */}
        <div className="overflow-auto flex-1">
          <table className="bp-table">
            <thead>
              <tr>
                <th className="cursor-pointer" onClick={() => toggleSort("name")}>
                  Material<span className="text-orange-500">{arrow("name")}</span>
                </th>
                <th className="cursor-pointer" onClick={() => toggleSort("category")}>
                  Category<span className="text-orange-500">{arrow("category")}</span>
                </th>
                <th className="cursor-pointer text-right" onClick={() => toggleSort("unit_cost")}>
                  Unit cost<span className="text-orange-500">{arrow("unit_cost")}</span>
                </th>
                <th className="text-center">Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    No materials match your search.
                  </td>
                </tr>
              ) : (
                filteredMaterials.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="font-medium text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-400">{m.unit_type}</div>
                    </td>
                    <td className="text-gray-500 text-xs">{m.category ?? "—"}</td>
                    <td className="text-right font-mono text-sm">
                      {formatCurrency(m.unit_cost)}
                    </td>
                    <td className="w-20">
                      <input
                        type="number"
                        min="0.001"
                        step="0.5"
                        value={qtyInputs[m.id] ?? ""}
                        onChange={(e) =>
                          setQtyInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && handleAdd(m)}
                        placeholder="1"
                        className="w-full px-2 py-1 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => handleAdd(m)}
                        title="Add to record"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Catalog footer count */}
        <div className="px-4 py-2 border-t border-[var(--border)] text-xs text-gray-400">
          {filteredMaterials.length} of {materials.length} materials
        </div>
      </div>

      {/* ── RIGHT: Line items + summary ── */}
      <div className="flex flex-col gap-4">

        {/* Line items card */}
        <div className="card flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Bill of Materials
              {items.length > 0 && (
                <span className="ml-2 inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
                  {items.length}
                </span>
              )}
            </h3>
          </div>

          <div className="overflow-auto flex-1">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6" />
                </svg>
                <p className="text-sm">No items yet</p>
                <p className="text-xs mt-1">Add materials from the catalog</p>
              </div>
            ) : (
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="text-center">Qty</th>
                    <th className="text-center">Waste %</th>
                    <th className="text-right">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <LineItemRow
                      key={item.id}
                      item={item}
                      materialName={
                        materials.find((m) => m.id === item.material_id)?.name ?? "Unknown"
                      }
                      onQtyChange={(v) => handleQtyChange(item.id, v)}
                      onWasteChange={(v) => handleWasteChange(item.id, v)}
                      onRemove={() => removeItemFromProject(projectId, item.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Cost summary card ── */}
        <div className="card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Cost Summary
          </h3>

          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>

          {taxPct > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax ({taxPct}%)</span>
              <span className="font-mono">{formatCurrency(taxAmount)}</span>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-2 flex justify-between font-semibold text-gray-900">
            <span>Total Estimate</span>
            <span className="font-mono text-orange-600 text-lg">
              {formatCurrency(grandTotal)}
            </span>
          </div>

          {items.length > 0 && (
            <p className="text-xs text-gray-400 pt-1">
              {items.length} line item{items.length !== 1 ? "s" : ""} · waste applied per item
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: editable line item row ──────────────────────

interface LineItemRowProps {
  item: ProjectItem;
  materialName: string;
  onQtyChange: (value: string) => void;
  onWasteChange: (value: string) => void;
  onRemove: () => void;
}

function LineItemRow({
  item,
  materialName,
  onQtyChange,
  onWasteChange,
  onRemove,
}: LineItemRowProps) {
  return (
    <tr className="group">
      <td>
        <div className="font-medium text-gray-900 text-sm">{materialName}</div>
        <div className="text-xs text-gray-400">
          {formatCurrency(item.unit_cost)} / {item.unit_type}
        </div>
      </td>

      <td className="w-20 text-center">
        <input
          type="number"
          min="0.001"
          step="0.5"
          defaultValue={item.quantity}
          onBlur={(e) => onQtyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onQtyChange((e.target as HTMLInputElement).value);
          }}
          className="w-16 px-2 py-1 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </td>

      <td className="w-20 text-center">
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          defaultValue={item.waste_pct}
          onBlur={(e) => onWasteChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onWasteChange((e.target as HTMLInputElement).value);
          }}
          className="w-16 px-2 py-1 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </td>

      <td className="text-right font-mono text-sm font-medium text-gray-900">
        {formatCurrency(item.line_subtotal)}
      </td>

      <td className="text-center">
        <button
          onClick={onRemove}
          title="Remove item"
          className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
