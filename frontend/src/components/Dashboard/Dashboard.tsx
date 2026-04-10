"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/hooks/useStore";
import { formatCurrency } from "@/lib/format";

const DASHBOARD_REFERENCE_TIME = Date.now();

/**
 * Dashboard — shows KPI cards derived from the prototype store
 * and quick-action links, styled in the HubSpot card pattern.
 */
export function Dashboard() {
  const { materials, vendors, projects, getMaterialById, getVendorById } = useStore();

  /** Aggregate metrics derived from current state. */
  const stats = useMemo(() => {
    const totalItems = projects.reduce((s, p) => s + p.items.length, 0);
    const totalEstimate = projects.reduce(
      (s, p) => s + p.items.reduce((a, i) => a + i.line_subtotal, 0),
      0,
    );
    const activeProjects = projects.filter((p) => p.status === "active").length;
    const draftProjects = projects.filter((p) => p.status === "draft").length;

    const orderedItems = projects.reduce(
      (count, project) => count + project.items.filter((item) => item.order_status === "ordered").length,
      0,
    );
    return { totalItems, totalEstimate, activeProjects, draftProjects, orderedItems };
  }, [projects]);

  const trend = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthTotal = projects
      .filter((project) => {
        const updatedAt = new Date(project.updated_at);
        return updatedAt.getMonth() === currentMonth && updatedAt.getFullYear() === currentYear;
      })
      .reduce(
        (sum, project) =>
          sum + project.items.reduce((itemSum, item) => itemSum + item.line_subtotal, 0),
        0,
      );

    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const previousMonth = previousMonthDate.getMonth();
    const previousYear = previousMonthDate.getFullYear();
    const previousMonthTotal = projects
      .filter((project) => {
        const updatedAt = new Date(project.updated_at);
        return updatedAt.getMonth() === previousMonth && updatedAt.getFullYear() === previousYear;
      })
      .reduce(
        (sum, project) =>
          sum + project.items.reduce((itemSum, item) => itemSum + item.line_subtotal, 0),
        0,
      );

    const delta = currentMonthTotal - previousMonthTotal;
    const deltaPct = previousMonthTotal > 0 ? (delta / previousMonthTotal) * 100 : 0;

    return { currentMonthTotal, previousMonthTotal, delta, deltaPct };
  }, [projects]);

  const spendByVendor = useMemo(() => {
    const totals = new Map<string, { name: string; amount: number }>();

    for (const project of projects) {
      for (const item of project.items) {
        const material = getMaterialById(item.material_id);
        const vendorId = material?.default_vendor_id;
        if (!vendorId) continue;

        const vendor = getVendorById(vendorId);
        const key = vendorId;
        const existing = totals.get(key);
        const amount = item.line_subtotal;

        if (existing) {
          existing.amount += amount;
        } else {
          totals.set(key, {
            name: vendor?.name || "Unknown Vendor",
            amount,
          });
        }
      }
    }

    return Array.from(totals.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [getMaterialById, getVendorById, projects]);

  const alerts = useMemo(() => {
    const now = DASHBOARD_REFERENCE_TIME;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const draftStaleCount = projects.filter((project) => {
      if (project.status !== "draft") return false;
      const updated = new Date(project.updated_at).getTime();
      return now - updated > oneWeekMs;
    }).length;

    const projectsMissingItems = projects.filter((project) => project.items.length === 0).length;

    const overdueDeliveries = projects.reduce((count, project) => {
      return (
        count +
        project.items.filter((item) => {
          if (!item.expected_delivery_at || item.order_status === "received") return false;
          return new Date(item.expected_delivery_at).getTime() < now;
        }).length
      );
    }, 0);

    return {
      draftStaleCount,
      projectsMissingItems,
      overdueDeliveries,
    };
  }, [projects]);

  const actionQueue = useMemo(() => {
    const orderedWithoutTracking = projects.reduce((count, project) => {
      return (
        count +
        project.items.filter(
          (item) =>
            item.order_status === "ordered" &&
            (!item.tracking_number || !item.tracking_number.trim()) &&
            (!item.tracking_url || !item.tracking_url.trim()),
        ).length
      );
    }, 0);

    return [
      {
        label: "Stale Draft Projects",
        value: alerts.draftStaleCount,
        hint: "Projects that need scope review before they go active.",
        href: "/projects",
      },
      {
        label: "Ordered Lines Missing Tracking",
        value: orderedWithoutTracking,
        hint: "Add carrier/tracking to reduce fulfillment ambiguity.",
        href: "/orders",
      },
      {
        label: "Empty Projects",
        value: alerts.projectsMissingItems,
        hint: "Projects without line items are unlikely to convert.",
        href: "/projects",
      },
    ];
  }, [alerts.draftStaleCount, alerts.projectsMissingItems, projects]);

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
    {
      label: "Ordered Lines",
      value: String(stats.orderedItems),
      color: "text-indigo-600",
      href: "/orders",
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

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <article className="card p-5 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Estimate Trend</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(trend.currentMonthTotal)}</p>
          <p className="mt-1 text-sm text-gray-500">Current month estimate value</p>
          <p className={`mt-3 text-sm font-semibold ${trend.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend.delta >= 0 ? "+" : ""}{formatCurrency(trend.delta)} ({trend.deltaPct.toFixed(1)}%) vs last month
          </p>
        </article>

        <article className="card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Spend Summary by Vendor</p>
          {spendByVendor.length === 0 ? (
            <p className="text-sm text-gray-500">No vendor spend tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {spendByVendor.map((vendor) => {
                const max = spendByVendor[0]?.amount || 1;
                const widthPct = Math.max(8, (vendor.amount / max) * 100);
                return (
                  <div key={vendor.name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800">{vendor.name}</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(vendor.amount)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-gray-100 overflow-hidden">
                      <div className="h-2 bg-orange-400" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Alerts</h2>
          <Link href="/orders" className="text-xs font-medium text-orange-500 hover:text-orange-600">Review orders</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Stale Drafts</p>
            <p className="text-xl font-bold text-amber-900">{alerts.draftStaleCount}</p>
            <p className="text-xs text-amber-700">Draft projects not updated in 7+ days</p>
            <Link href="/projects" className="mt-2 inline-block text-xs font-semibold text-amber-800 hover:underline">
              Review drafts
            </Link>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Empty Projects</p>
            <p className="text-xl font-bold text-sky-900">{alerts.projectsMissingItems}</p>
            <p className="text-xs text-sky-700">Projects with zero line items</p>
            <Link href="/projects" className="mt-2 inline-block text-xs font-semibold text-sky-800 hover:underline">
              Fill project items
            </Link>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Overdue Deliveries</p>
            <p className="text-xl font-bold text-rose-900">{alerts.overdueDeliveries}</p>
            <p className="text-xs text-rose-700">Ordered lines past expected delivery date</p>
            <Link href="/orders" className="mt-2 inline-block text-xs font-semibold text-rose-800 hover:underline">
              Resolve deliveries
            </Link>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Action Queue</h2>
          <Link href="/settings" className="text-xs font-medium text-orange-500 hover:text-orange-600">Team settings</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {actionQueue.map((entry) => (
            <Link
              key={entry.label}
              href={entry.href}
              className="rounded-lg border border-gray-200 bg-white p-3 hover:border-orange-300 hover:bg-orange-50/40 transition-colors"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{entry.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{entry.value}</p>
              <p className="mt-1 text-xs text-gray-600">{entry.hint}</p>
            </Link>
          ))}
        </div>
      </section>

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
