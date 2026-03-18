"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/hooks/useStore";
import { formatCurrency } from "@/lib/format";

/**
 * Dashboard — shows KPI cards derived from the prototype store
 * and quick-action links, styled in the HubSpot card pattern.
 */
export function Dashboard() {
  const { materials, vendors, customers, projects } = useStore();

  /** Aggregate metrics derived from current state. */
  const stats = useMemo(() => {
    const totalItems = projects.reduce((s, p) => s + p.items.length, 0);
    const totalEstimate = projects.reduce(
      (s, p) => s + p.items.reduce((a, i) => a + i.line_subtotal, 0),
      0,
    );
    const activeProjects = projects.filter((p) => p.status === "active").length;
    const draftProjects = projects.filter((p) => p.status === "draft").length;

    return { totalItems, totalEstimate, activeProjects, draftProjects };
  }, [projects]);

  const kpis: { label: string; value: string; color: string; href: string }[] = [
    {
      label: "Active Projects",
      value: String(stats.activeProjects),
      color: "text-green-600",
      href: "/projects",
    },
    {
      label: "Draft Projects",
      value: String(stats.draftProjects),
      color: "text-yellow-600",
      href: "/projects",
    },
    {
      label: "Materials in Catalog",
      value: String(materials.length),
      color: "text-blue-600",
      href: "/materials",
    },
    {
      label: "Total Estimate Value",
      value: formatCurrency(stats.totalEstimate),
      color: "text-orange-600",
      href: "/projects",
    },
    {
      label: "Line Items",
      value: String(stats.totalItems),
      color: "text-purple-600",
      href: "/projects",
    },
    {
      label: "Vendors",
      value: String(vendors.length),
      color: "text-teal-600",
      href: "/materials",
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your materials, projects &amp; estimates.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="card p-5 hover:shadow-md transition-shadow group"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 group-hover:text-gray-500">
              {kpi.label}
            </p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </Link>
        ))}
      </div>

      {/* Recent projects table */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Recent Projects
          </h2>
          <Link
            href="/projects"
            className="text-xs font-medium text-orange-500 hover:text-orange-600"
          >
            View all &rarr;
          </Link>
        </div>
        <table className="bp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Items</th>
              <th className="text-right">Estimate</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  No projects yet — create one to get started.
                </td>
              </tr>
            ) : (
              projects.slice(0, 5).map((p) => {
                const est = p.items.reduce((s, i) => s + i.line_subtotal, 0);
                return (
                  <tr key={p.id}>
                    <td className="font-medium text-gray-900">
                      <Link href={`/projects/${p.id}`} className="hover:text-orange-600">
                        {p.name}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                          p.status === "active"
                            ? "bg-green-100 text-green-700"
                            : p.status === "closed"
                            ? "bg-gray-200 text-gray-600"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>{p.items.length}</td>
                    <td className="text-right font-mono">
                      {formatCurrency(est)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
