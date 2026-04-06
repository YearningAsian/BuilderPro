"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/hooks/useStore";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency } from "@/lib/format";
import type { Material, Project } from "@/types";

type SearchTab = "all" | "materials" | "projects";

function matchesQuery(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase());
}

/**
 * Global search page – debounced query searches across materials & projects.
 * Results are grouped by type with direct links.
 */
export function SearchBar() {
  const [raw, setRaw] = useState("");
  const query = useDebounce(raw, 250);
  const [tab, setTab] = useState<SearchTab>("all");
  const { materials, projects, getVendorById, getCustomerById } = useStore();

  const filteredMaterials = useMemo<Material[]>(() => {
    if (!query) return [];
    return materials.filter(
      (m) =>
        matchesQuery(m.name, query) ||
        matchesQuery(m.category ?? "", query) ||
        matchesQuery(m.sku ?? "", query) ||
        matchesQuery(m.unit_type, query)
    );
  }, [query, materials]);

  const filteredProjects = useMemo<Project[]>(() => {
    if (!query) return [];
    return projects.filter(
      (p) =>
        matchesQuery(p.name, query) ||
        matchesQuery(p.status, query) ||
        matchesQuery(getCustomerById(p.customer_id)?.name ?? "", query)
    );
  }, [query, projects, getCustomerById]);

  const showMaterials = tab === "all" || tab === "materials";
  const showProjects = tab === "all" || tab === "projects";
  const totalResults =
    (showMaterials ? filteredMaterials.length : 0) +
    (showProjects ? filteredProjects.length : 0);

  const TABS: { key: SearchTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "materials", label: "Materials" },
    { key: "projects", label: "Projects" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900">Search</h1>

      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Search materials, projects, customers…"
          autoFocus
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent
                     bg-white placeholder:text-gray-400"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {!query && (
        <p className="text-sm text-gray-400 pt-4">Type to search across all data…</p>
      )}

      {query && totalResults === 0 && (
        <p className="text-sm text-gray-500 pt-4">
          No results for &ldquo;{query}&rdquo;
        </p>
      )}

      {query && showMaterials && filteredMaterials.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Materials ({filteredMaterials.length})
          </h2>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {filteredMaterials.map((m) => {
              const vendor = m.default_vendor_id ? getVendorById(m.default_vendor_id) : null;
              return (
                <Link
                  key={m.id}
                  href="/materials"
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="font-medium text-gray-800">{m.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{m.category}</span>
                    {vendor && (
                      <span className="ml-2 text-xs text-gray-400">
                        · {vendor.name}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-700">
                    {formatCurrency(m.unit_cost)}/{m.unit_type}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {query && showProjects && filteredProjects.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Projects ({filteredProjects.length})
          </h2>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {filteredProjects.map((p) => {
              const cust = getCustomerById(p.customer_id);
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="font-medium text-gray-800">{p.name}</span>
                    {cust && (
                      <span className="ml-2 text-xs text-gray-400">· {cust.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {formatCurrency(
                        p.items.reduce((sum, it) => sum + it.line_subtotal, 0)
                      )}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        p.status === "active"
                          ? "bg-green-100 text-green-700"
                          : p.status === "draft"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
