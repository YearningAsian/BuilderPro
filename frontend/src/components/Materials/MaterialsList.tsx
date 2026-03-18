"use client";

import { useMemo, useState, useCallback } from "react";
import { useStore } from "@/hooks/useStore";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency, formatPercent } from "@/lib/format";
import { MATERIAL_CATEGORIES } from "@/data/seed";
import type { Material, SortConfig } from "@/types";

type MaterialSortKey = "name" | "category" | "unit_type" | "unit_cost" | "sku";

/**
 * Sortable column header.
 * Shows a directional arrow when this column is the active sort key.
 */
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

/**
 * Materials catalog with:
 * - debounced search (name / SKU / vendor)
 * - category filter chips
 * - sortable columns (name, category, unit cost, etc.)
 */
export function MaterialsList() {
  const { materials, vendors, getVendorById } = useStore();

  // ── Search & filter state ──
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // ── Sort state ──
  const [sort, setSort] = useState<SortConfig<MaterialSortKey> | null>(null);

  const toggleSort = useCallback(
    (key: MaterialSortKey) => {
      setSort((prev) => {
        if (prev?.key === key) {
          return prev.direction === "asc"
            ? { key, direction: "desc" }
            : null; // third click clears
        }
        return { key, direction: "asc" };
      });
    },
    [],
  );

  /** Filtered + sorted material list. */
  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    let list = materials.filter((m) => {
      const matchesQuery =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.sku && m.sku.toLowerCase().includes(q)) ||
        (m.category && m.category.toLowerCase().includes(q));
      const matchesCat = !categoryFilter || m.category === categoryFilter;
      return matchesQuery && matchesCat;
    });

    if (sort) {
      list = [...list].sort((a, b) => {
        const av = a[sort.key] ?? "";
        const bv = b[sort.key] ?? "";
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sort.direction === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [materials, debouncedQuery, categoryFilter, sort]);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Materials Catalog</h1>
        <p className="text-sm text-gray-500 mt-1">
          {materials.length} materials from {vendors.length} vendors
        </p>
      </div>

      {/* Search + filter bar */}
      <div className="card p-4 flex flex-col md:flex-row gap-4">
        {/* Search input */}
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU, or category…"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
          />
        </div>

        {/* Category chips */}
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
          {MATERIAL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                categoryFilter === cat
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400">
        Showing {filtered.length} of {materials.length} materials
      </p>

      {/* Table */}
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400">
                  No materials match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((m) => {
                const vendor = m.default_vendor_id
                  ? getVendorById(m.default_vendor_id)
                  : null;
                return (
                  <tr key={m.id}>
                    <td className="font-medium text-gray-900">{m.name}</td>
                    <td>
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                        {m.category ?? "—"}
                      </span>
                    </td>
                    <td>{m.unit_type}</td>
                    <td className="font-mono">{formatCurrency(m.unit_cost)}</td>
                    <td className="font-mono text-gray-500">{m.sku ?? "—"}</td>
                    <td className="text-gray-600">{vendor?.name ?? "—"}</td>
                    <td>{formatPercent(m.default_waste_pct)}</td>
                    <td>
                      {m.is_taxable ? (
                        <span className="text-green-600 text-xs font-semibold">Yes</span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
