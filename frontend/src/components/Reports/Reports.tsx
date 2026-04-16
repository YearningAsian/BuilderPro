"use client";

import { useState, useCallback } from "react";
import { reportsApi, type MaterialUsageReport, type VendorSpendingReport, type ProjectBudgetReport } from "@/services/api";
import { formatCurrency } from "@/lib/format";

type ReportTab = "material-usage" | "vendor-spending" | "project-budget";
type ProjectStatus = "" | "draft" | "active" | "closed";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
];

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-700"
      : status === "closed"
      ? "bg-gray-200 text-gray-600"
      : "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${cls}`}>
      {status}
    </span>
  );
}

export function Reports() {
  const [activeTab, setActiveTab] = useState<ReportTab>("project-budget");

  // Shared filter
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("");

  // Material usage extras
  const [category, setCategory] = useState("");

  // Loading / error / data state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materialData, setMaterialData] = useState<MaterialUsageReport | null>(null);
  const [vendorData, setVendorData] = useState<VendorSpendingReport | null>(null);
  const [budgetData, setBudgetData] = useState<ProjectBudgetReport | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "material-usage") {
        const data = await reportsApi.materialUsage({
          project_status: projectStatus || undefined,
          category: category.trim() || undefined,
        });
        setMaterialData(data);
      } else if (activeTab === "vendor-spending") {
        const data = await reportsApi.vendorSpending({
          project_status: projectStatus || undefined,
        });
        setVendorData(data);
      } else {
        const data = await reportsApi.projectBudget({
          status: projectStatus || undefined,
        });
        setBudgetData(data);
      }
      setHasRun(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, projectStatus, category]);

  const tabs: { id: ReportTab; label: string }[] = [
    { id: "project-budget", label: "Project Budget" },
    { id: "material-usage", label: "Material Usage" },
    { id: "vendor-spending", label: "Vendor Spending" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Parameterized analytics across projects, materials, and vendors.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setHasRun(false);
                setError(null);
              }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filter panel */}
      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Parameters
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Project Status
            <select
              value={projectStatus}
              onChange={(e) => setProjectStatus(e.target.value as ProjectStatus)}
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {activeTab === "material-usage" && (
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Category (optional)
              <input
                type="text"
                placeholder="e.g. Framing Lumber"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 w-52"
              />
            </label>
          )}

          <button
            type="button"
            onClick={runReport}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Running…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Run Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {!hasRun && !loading && (
        <div className="card p-10 text-center text-gray-400 text-sm">
          Configure parameters above and click <strong>Run Report</strong> to generate results.
        </div>
      )}

      {hasRun && !loading && !error && (
        <>
          {/* Project Budget Report */}
          {activeTab === "project-budget" && budgetData && (
            <div className="space-y-4">
              {/* Summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Projects", value: String(budgetData.total_projects) },
                  { label: "Cost Subtotal", value: formatCurrency(budgetData.combined_subtotal) },
                  { label: "Tax", value: formatCurrency(budgetData.combined_tax) },
                  { label: "Grand Total", value: formatCurrency(budgetData.combined_grand_total) },
                ].map((s) => (
                  <div key={s.label} className="card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="card overflow-hidden">
                <table className="bp-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th className="text-right">Items</th>
                      <th className="text-right">Subtotal</th>
                      <th className="text-right">Tax</th>
                      <th className="text-right">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">
                          No projects match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      budgetData.rows.map((row) => (
                        <tr key={row.project_id}>
                          <td className="font-medium text-gray-900">
                            <a href={`/projects/${row.project_id}`} className="hover:text-orange-600">
                              {row.project_name}
                            </a>
                          </td>
                          <td className="text-gray-600">{row.customer_name}</td>
                          <td><StatusBadge status={row.status} /></td>
                          <td className="text-right text-gray-700">{row.item_count}</td>
                          <td className="text-right font-mono text-gray-800">{formatCurrency(row.cost_subtotal)}</td>
                          <td className="text-right font-mono text-gray-600">
                            {formatCurrency(row.tax_amount)}
                            {row.tax_pct > 0 && (
                              <span className="ml-1 text-xs text-gray-400">({row.tax_pct.toFixed(1)}%)</span>
                            )}
                          </td>
                          <td className="text-right font-mono font-semibold text-gray-900">{formatCurrency(row.grand_total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Material Usage Report */}
          {activeTab === "material-usage" && materialData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Materials Listed", value: String(materialData.total_items_counted) },
                  { label: "Total Line Cost", value: formatCurrency(materialData.total_cost) },
                ].map((s) => (
                  <div key={s.label} className="card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="card overflow-hidden">
                <table className="bp-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Category</th>
                      <th className="text-right">Total Qty</th>
                      <th>Unit</th>
                      <th className="text-right">Total Cost</th>
                      <th className="text-right">Projects Used In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400">
                          No materials match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      materialData.rows.map((row) => (
                        <tr key={row.material_id}>
                          <td className="font-medium text-gray-900">{row.material_name}</td>
                          <td className="text-gray-500">{row.category ?? "—"}</td>
                          <td className="text-right font-mono text-gray-800">{row.total_quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="text-gray-500">{row.unit_type}</td>
                          <td className="text-right font-mono font-semibold text-gray-900">{formatCurrency(row.total_cost)}</td>
                          <td className="text-right text-gray-700">{row.project_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Vendor Spending Report */}
          {activeTab === "vendor-spending" && vendorData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Vendors", value: String(vendorData.rows.length) },
                  { label: "Total Spend", value: formatCurrency(vendorData.grand_total) },
                ].map((s) => (
                  <div key={s.label} className="card p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              {vendorData.rows.length > 0 && (
                <div className="card p-5 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Spend Distribution</p>
                  {vendorData.rows.map((row) => {
                    const max = vendorData.rows[0]?.total_cost || 1;
                    const pct = Math.max(4, (row.total_cost / max) * 100);
                    return (
                      <div key={row.vendor_name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-800">{row.vendor_name}</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(row.total_cost)}</span>
                        </div>
                        <div className="h-2 rounded bg-gray-100 overflow-hidden">
                          <div
                            className={`h-2 rounded ${row.vendor_id ? "bg-orange-400" : "bg-gray-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {row.material_count} material{row.material_count !== 1 ? "s" : ""} · {row.line_item_count} line item{row.line_item_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="card overflow-hidden">
                <table className="bp-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th className="text-right">Materials</th>
                      <th className="text-right">Line Items</th>
                      <th className="text-right">Total Spend</th>
                      <th className="text-right">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400">
                          No vendor spend data found.
                        </td>
                      </tr>
                    ) : (
                      vendorData.rows.map((row) => {
                        const pct = vendorData.grand_total > 0 ? (row.total_cost / vendorData.grand_total) * 100 : 0;
                        return (
                          <tr key={row.vendor_name}>
                            <td className="font-medium text-gray-900">{row.vendor_name}</td>
                            <td className="text-right text-gray-700">{row.material_count}</td>
                            <td className="text-right text-gray-700">{row.line_item_count}</td>
                            <td className="text-right font-mono font-semibold text-gray-900">{formatCurrency(row.total_cost)}</td>
                            <td className="text-right text-gray-600">{pct.toFixed(1)}%</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
