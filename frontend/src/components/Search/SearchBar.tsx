"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/hooks/useStore";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCurrency } from "@/lib/format";
import { searchApi } from "@/services/api";
import type { SearchEntity, SearchResponse } from "@/types";

/**
 * Global search page with backend-powered query and advanced filters.
 */
export function SearchBar() {
  const [raw, setRaw] = useState("");
  const query = useDebounce(raw, 300);
  const [entity, setEntity] = useState<SearchEntity>("all");
  const [projectStatus, setProjectStatus] = useState<"all" | "draft" | "active" | "closed">("all");
  const [materialCategory, setMaterialCategory] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [limit, setLimit] = useState(25);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { materials, vendors, projects, getVendorById, getCustomerById } = useStore();

  const categories = useMemo(
    () =>
      Array.from(new Set(materials.map((material) => material.category?.trim()).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b),
      ),
    [materials],
  );

  useEffect(() => {
    let active = true;

    async function runSearch() {
      const normalizedQuery = query.trim();
      if (normalizedQuery.length < 2) {
        if (active) {
          setResults(null);
          setError(null);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const payload = await searchApi.run({
          q: normalizedQuery,
          entity,
          project_status: projectStatus === "all" ? undefined : projectStatus,
          material_category: materialCategory === "all" ? undefined : materialCategory,
          vendor_id: vendorId === "all" ? undefined : vendorId,
          project_id: projectId === "all" ? undefined : projectId,
          limit,
        });

        if (!active) return;
        setResults(payload);
      } catch (e) {
        if (!active) return;
        setResults(null);
        setError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void runSearch();

    return () => {
      active = false;
    };
  }, [entity, limit, materialCategory, projectId, projectStatus, query, vendorId]);

  const totalResults = results?.total ?? 0;
  const showMaterials = entity === "all" || entity === "materials";
  const showProjects = entity === "all" || entity === "projects";
  const showCustomers = entity === "all" || entity === "customers";
  const showVendors = entity === "all" || entity === "vendors";

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as SearchEntity)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">All</option>
            <option value="materials">Materials</option>
            <option value="projects">Projects</option>
            <option value="customers">Customers</option>
            <option value="vendors">Vendors</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Project Status</span>
          <select
            value={projectStatus}
            onChange={(e) => setProjectStatus(e.target.value as "all" | "draft" | "active" | "closed")}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">Any</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Material Category</span>
          <select
            value={materialCategory}
            onChange={(e) => setMaterialCategory(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">Any</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor</span>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">Any</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="all">Any</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Limit</span>
          <select
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>

      {/* Results */}
      {query.trim().length < 2 && (
        <p className="text-sm text-gray-400 pt-4">Type to search across all data…</p>
      )}

      {query.trim().length >= 2 && isLoading && (
        <p className="text-sm text-gray-500 pt-4">Searching workspace data…</p>
      )}

      {query.trim().length >= 2 && error && (
        <p className="text-sm text-red-600 pt-4">{error}</p>
      )}

      {query.trim().length >= 2 && !isLoading && !error && totalResults === 0 && (
        <p className="text-sm text-gray-500 pt-4">
          No results for &ldquo;{query}&rdquo;
        </p>
      )}

      {results && showMaterials && results.materials.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Materials ({results.materials.length})
          </h2>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {results.materials.map((m) => {
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

      {results && showProjects && results.projects.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Projects ({results.projects.length})
          </h2>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {results.projects.map((p) => {
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
                    <span className="text-sm text-gray-600">{formatCurrency(p.estimate_total)}</span>
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

      {results && showCustomers && results.customers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Customers ({results.customers.length})
          </h2>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {results.customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-800">{customer.name}</span>
                <span className="text-xs text-gray-500">{customer.email ?? customer.phone ?? "No contact"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results && showVendors && results.vendors.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Vendors ({results.vendors.length})
          </h2>
          <div className="card divide-y divide-gray-100 overflow-hidden">
            {results.vendors.map((vendor) => (
              <Link
                key={vendor.id}
                href={`/vendors/${vendor.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-800">{vendor.name}</span>
                <span className="text-xs text-gray-500">{vendor.email ?? vendor.phone ?? "No contact"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
