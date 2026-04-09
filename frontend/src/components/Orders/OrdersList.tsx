"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { formatCurrency, formatDate, truncate } from "@/lib/format";
import type { OrderStatus, ProjectStatus } from "@/types";

type ProcurementState = "ready" | "needs-vendor" | "planning" | "ordered" | "closed";

type OrderRow = {
  id: string;
  projectId: string;
  projectName: string;
  materialId: string;
  materialName: string;
  vendorId: string | null;
  vendorName: string;
  vendorEmail: string | null;
  orderStatus: OrderStatus;
  procurementState: ProcurementState;
  status: ProjectStatus;
  quantityLabel: string;
  total: number;
  updatedAt: string;
  orderedAt: string | null;
  receivedAt: string | null;
  poNumber: string;
  purchaseNotes: string;
  notes: string | null;
};

type VendorBatch = {
  vendorId: string;
  vendorName: string;
  vendorEmail: string | null;
  rows: OrderRow[];
  readyRows: OrderRow[];
  orderedRows: OrderRow[];
  receivedRows: OrderRow[];
  spend: number;
  projectCount: number;
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-200 text-gray-600",
};

const PROCUREMENT_STYLES: Record<ProcurementState, string> = {
  ready: "bg-emerald-100 text-emerald-700",
  "needs-vendor": "bg-rose-100 text-rose-700",
  planning: "bg-amber-100 text-amber-700",
  ordered: "bg-sky-100 text-sky-700",
  closed: "bg-slate-200 text-slate-600",
};

const STATUS_OPTIONS: Array<ProjectStatus | "all"> = ["all", "active", "draft", "closed"];
const ORDER_STATUS_OPTIONS: OrderStatus[] = ["draft", "ordered", "received", "cancelled"];

export function OrdersList() {
  const { projects, getMaterialById, getVendorById, updateProjectItem } = useStore();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [savingBatchVendorId, setSavingBatchVendorId] = useState<string | null>(null);
  const [vendorPoNumbers, setVendorPoNumbers] = useState<Record<string, string>>({});
  const [batchStatusMessage, setBatchStatusMessage] = useState<string>("");
  const [batchErrorMessage, setBatchErrorMessage] = useState<string>("");

  const orderRows = useMemo<OrderRow[]>(() => {
    return projects
      .flatMap((project) =>
        project.items.map((item) => {
          const material = getMaterialById(item.material_id);
          const vendor = material?.default_vendor_id
            ? getVendorById(material.default_vendor_id)
            : undefined;

          const vendorName = vendor?.name ?? "Vendor not assigned";
          const orderStatus = item.order_status ?? "draft";
          const procurementState: ProcurementState =
            orderStatus === "received" || orderStatus === "cancelled" || project.status === "closed"
              ? "closed"
              : orderStatus === "ordered"
                ? "ordered"
                : vendor
                  ? project.status === "active"
                    ? "ready"
                    : "planning"
                  : "needs-vendor";

          return {
            id: item.id,
            projectId: project.id,
            projectName: project.name,
            materialId: item.material_id,
            materialName: material?.name ?? "Unknown material",
            vendorId: vendor?.id ?? null,
            vendorName,
            vendorEmail: vendor?.email ?? null,
            orderStatus,
            procurementState,
            status: project.status,
            quantityLabel: `${item.total_qty.toFixed(2)} ${item.unit_type}`,
            total: item.line_subtotal,
            updatedAt: item.updated_at,
            orderedAt: item.ordered_at,
            receivedAt: item.received_at,
            poNumber: item.po_number ?? "",
            purchaseNotes: item.purchase_notes ?? "",
            notes: item.notes,
          };
        }),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [projects, getMaterialById, getVendorById]);

  const projectOptions = useMemo(
    () => Array.from(new Set(orderRows.map((row) => row.projectName))).sort((a, b) => a.localeCompare(b)),
    [orderRows],
  );

  const vendorOptions = useMemo(
    () => Array.from(new Set(orderRows.map((row) => row.vendorName))).sort((a, b) => a.localeCompare(b)),
    [orderRows],
  );

  const filteredRows = useMemo(
    () =>
      orderRows.filter((row) => {
        const statusMatch = statusFilter === "all" || row.status === statusFilter;
        const projectMatch = projectFilter === "all" || row.projectName === projectFilter;
        const vendorMatch = vendorFilter === "all" || row.vendorName === vendorFilter;
        return statusMatch && projectMatch && vendorMatch;
      }),
    [orderRows, statusFilter, projectFilter, vendorFilter],
  );

  const totalSpend = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.total, 0),
    [filteredRows],
  );

  const activeProjects = useMemo(
    () => new Set(filteredRows.filter((row) => row.status === "active").map((row) => row.projectId)).size,
    [filteredRows],
  );

  const vendorCount = useMemo(
    () => new Set(filteredRows.map((row) => row.vendorName).filter((name) => name !== "Vendor not assigned")).size,
    [filteredRows],
  );

  const readyToOrderCount = useMemo(
    () => filteredRows.filter((row) => row.procurementState === "ready").length,
    [filteredRows],
  );

  const needsVendorCount = useMemo(
    () => filteredRows.filter((row) => row.procurementState === "needs-vendor").length,
    [filteredRows],
  );

  const vendorBatches = useMemo<VendorBatch[]>(() => {
    const batchMap = new Map<string, VendorBatch>();

    for (const row of filteredRows) {
      if (!row.vendorId) continue;

      const existing = batchMap.get(row.vendorId);
      if (existing) {
        existing.rows.push(row);
        existing.spend += row.total;
        continue;
      }

      batchMap.set(row.vendorId, {
        vendorId: row.vendorId,
        vendorName: row.vendorName,
        vendorEmail: row.vendorEmail,
        rows: [row],
        readyRows: [],
        orderedRows: [],
        receivedRows: [],
        spend: row.total,
        projectCount: 0,
      });
    }

    for (const batch of batchMap.values()) {
      batch.readyRows = batch.rows.filter((row) => row.procurementState === "ready");
      batch.orderedRows = batch.rows.filter((row) => row.orderStatus === "ordered");
      batch.receivedRows = batch.rows.filter((row) => row.orderStatus === "received");
      batch.projectCount = new Set(batch.rows.map((row) => row.projectId)).size;
    }

    return Array.from(batchMap.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [filteredRows]);

  async function handleOrderPatch(
    projectId: string,
    itemId: string,
    patch: Partial<{ order_status: OrderStatus; po_number: string | null; purchase_notes: string | null }>,
  ) {
    try {
      setSavingItemId(itemId);
      await updateProjectItem(projectId, itemId, patch);
    } catch (error) {
      console.warn("Failed to update purchase details", error);
    } finally {
      setSavingItemId((current) => (current === itemId ? null : current));
    }
  }

  async function handleBatchStatusUpdate(
    vendorId: string,
    vendorName: string,
    rows: OrderRow[],
    nextStatus: OrderStatus,
  ) {
    if (rows.length === 0) return;

    setBatchErrorMessage("");
    setBatchStatusMessage("");
    setSavingBatchVendorId(vendorId);

    const poNumber = vendorPoNumbers[vendorId]?.trim() ?? "";

    try {
      await Promise.all(
        rows.map((row) => {
          const patch: Partial<{ order_status: OrderStatus; po_number: string | null }> = {
            order_status: nextStatus,
          };

          if (nextStatus === "ordered" && poNumber) {
            patch.po_number = poNumber;
          }

          return updateProjectItem(row.projectId, row.id, patch);
        }),
      );

      const actionLabel = nextStatus === "ordered" ? "ordered" : nextStatus === "received" ? "received" : nextStatus;
      setBatchStatusMessage(`Updated ${rows.length} line(s) for ${vendorName} to ${actionLabel}.`);
    } catch (error) {
      setBatchErrorMessage(
        error instanceof Error ? error.message : `Unable to update batch for ${vendorName}.`,
      );
    } finally {
      setSavingBatchVendorId((current) => (current === vendorId ? null : current));
    }
  }

  function exportVendorBatchCsv(batch: VendorBatch) {
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const header = [
      "vendor",
      "vendor_email",
      "project",
      "material",
      "status",
      "order_status",
      "quantity",
      "line_total",
      "po_number",
      "purchase_notes",
      "updated_at",
      "ordered_at",
      "received_at",
    ];

    const rows = batch.rows.map((row) => [
      escapeCell(batch.vendorName),
      escapeCell(batch.vendorEmail ?? ""),
      escapeCell(row.projectName),
      escapeCell(row.materialName),
      escapeCell(row.status),
      escapeCell(row.orderStatus),
      escapeCell(row.quantityLabel),
      row.total.toFixed(2),
      escapeCell(row.poNumber),
      escapeCell(row.purchaseNotes),
      escapeCell(row.updatedAt),
      escapeCell(row.orderedAt ?? ""),
      escapeCell(row.receivedAt ?? ""),
    ]);

    const csv = [header.join(","), ...rows.map((entry) => entry.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${batch.vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-orders.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders & Purchasing</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review workspace purchase line items, vendor assignments, and estimated order totals.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Manage project items
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order lines</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{filteredRows.length}</p>
          <p className="text-sm text-gray-500">Workspace purchase/estimate items</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Projected spend</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(totalSpend)}</p>
          <p className="text-sm text-gray-500">Subtotal across the current filter</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor coverage</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{vendorCount}</p>
          <p className="text-sm text-gray-500">Vendors referenced across {activeProjects} active project(s)</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ready to order</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{readyToOrderCount}</p>
          <p className="text-sm text-gray-500">Active lines with a vendor already assigned</p>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Order queue</h2>
            <p className="text-sm text-gray-500">Filter project line items by status, project, or vendor before handing them off for purchasing.</p>
          </div>
          <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
            <span className="font-semibold">{readyToOrderCount}</span> ready to order · <span className="font-semibold">{needsVendorCount}</span> still need vendor setup
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((option) => {
            const active = statusFilter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option === "all" ? "All statuses" : option}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Project</span>
            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="all">All projects</option>
              {projectOptions.map((projectName) => (
                <option key={projectName} value={projectName}>
                  {projectName}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Vendor</span>
            <select
              value={vendorFilter}
              onChange={(event) => setVendorFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            >
              <option value="all">All vendors</option>
              {vendorOptions.map((vendorName) => (
                <option key={vendorName} value={vendorName}>
                  {vendorName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="card p-4 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Vendor order batches</h2>
            <p className="text-sm text-gray-500">
              Move ready lines to ordered in one step per vendor, then close delivery as received when materials arrive.
            </p>
          </div>
          <p className="text-sm text-gray-500">{vendorBatches.length} vendor batch(es) in current filter</p>
        </div>

        {batchErrorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {batchErrorMessage}
          </p>
        )}

        {batchStatusMessage && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {batchStatusMessage}
          </p>
        )}

        {vendorBatches.length === 0 ? (
          <p className="text-sm text-gray-500">Assign vendors and add project line items to unlock vendor batching.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="bp-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Projects</th>
                  <th>Ready</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th className="text-right">Batch total</th>
                  <th>Batch actions</th>
                </tr>
              </thead>
              <tbody>
                {vendorBatches.map((batch) => {
                  const isSavingBatch = savingBatchVendorId === batch.vendorId;
                  return (
                    <tr key={batch.vendorId}>
                      <td>
                        <div className="space-y-1">
                          <p className="font-medium text-gray-900">{batch.vendorName}</p>
                          <p className="text-xs text-gray-500">{batch.vendorEmail || "No vendor email on file"}</p>
                        </div>
                      </td>
                      <td className="text-gray-600">{batch.projectCount}</td>
                      <td className="text-gray-600">{batch.readyRows.length}</td>
                      <td className="text-gray-600">{batch.orderedRows.length}</td>
                      <td className="text-gray-600">{batch.receivedRows.length}</td>
                      <td className="text-right font-mono font-semibold text-gray-900">{formatCurrency(batch.spend)}</td>
                      <td>
                        <div className="min-w-72 space-y-2">
                          <input
                            type="text"
                            value={vendorPoNumbers[batch.vendorId] ?? ""}
                            placeholder="Default PO number for batch"
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setVendorPoNumbers((prev) => ({ ...prev, [batch.vendorId]: nextValue }));
                            }}
                            disabled={isSavingBatch}
                            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void handleBatchStatusUpdate(batch.vendorId, batch.vendorName, batch.readyRows, "ordered");
                              }}
                              disabled={isSavingBatch || batch.readyRows.length === 0}
                              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
                            >
                              Mark ready as ordered ({batch.readyRows.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleBatchStatusUpdate(batch.vendorId, batch.vendorName, batch.orderedRows, "received");
                              }}
                              disabled={isSavingBatch || batch.orderedRows.length === 0}
                              className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-sky-100 disabled:text-sky-300"
                            >
                              Mark ordered as received ({batch.orderedRows.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => exportVendorBatchCsv(batch)}
                              disabled={isSavingBatch || batch.rows.length === 0}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                            >
                              Export CSV
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="card overflow-x-auto">
        <table className="bp-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Project</th>
              <th>Material</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Purchasing</th>
              <th>Quantity</th>
              <th className="text-right">Total</th>
              <th>Timeline</th>
              <th>PO & stage</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-gray-500">
                  <div className="space-y-2">
                    <p className="font-medium text-gray-700">No order lines yet.</p>
                    <p className="text-sm text-gray-500">
                      Add materials to a project to start tracking purchasing and estimated order totals.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <Link href="/projects" className="text-sm font-medium text-orange-600 hover:text-orange-700">
                        Go to projects
                      </Link>
                      <Link href="/materials" className="text-sm font-medium text-orange-600 hover:text-orange-700">
                        Review materials catalog
                      </Link>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs text-gray-500">#{row.id.slice(0, 8)}</td>
                  <td>
                    <Link href={`/projects/${row.projectId}`} className="font-medium text-gray-900 hover:text-orange-600">
                      {row.projectName}
                    </Link>
                  </td>
                  <td>
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900">{row.materialName}</p>
                      <p className="text-xs text-gray-500">{truncate(row.notes, 36)}</p>
                    </div>
                  </td>
                  <td>
                    <div className="space-y-1">
                      <p className="text-gray-600">{row.vendorName}</p>
                      {row.vendorName === "Vendor not assigned" ? (
                        <Link href="/materials" className="text-xs font-medium text-orange-600 hover:text-orange-700">
                          Assign vendor
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">Ready for vendor outreach</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_STYLES[row.status] ?? STATUS_STYLES.draft
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        PROCUREMENT_STYLES[row.procurementState]
                      }`}
                    >
                      {row.procurementState}
                    </span>
                  </td>
                  <td className="text-gray-600">{row.quantityLabel}</td>
                  <td className="text-right font-mono font-semibold text-gray-900">
                    {formatCurrency(row.total)}
                  </td>
                  <td className="text-sm text-gray-500">
                    <div className="space-y-1">
                      <p>Updated {formatDate(row.updatedAt)}</p>
                      <p>{row.orderedAt ? `Ordered ${formatDate(row.orderedAt)}` : "Not ordered yet"}</p>
                      <p>{row.receivedAt ? `Received ${formatDate(row.receivedAt)}` : "Awaiting receipt"}</p>
                    </div>
                  </td>
                  <td>
                    <div className="space-y-2 min-w-55">
                      <select
                        value={row.orderStatus}
                        onChange={(event) => {
                          void handleOrderPatch(row.projectId, row.id, { order_status: event.target.value as OrderStatus });
                        }}
                        disabled={savingItemId === row.id}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                      >
                        {ORDER_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        defaultValue={row.poNumber}
                        placeholder="PO number"
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim();
                          if (nextValue !== row.poNumber) {
                            void handleOrderPatch(row.projectId, row.id, { po_number: nextValue || null });
                          }
                        }}
                        disabled={savingItemId === row.id}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                      />
                      <textarea
                        defaultValue={row.purchaseNotes}
                        placeholder="Purchase notes"
                        rows={2}
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim();
                          if (nextValue !== row.purchaseNotes) {
                            void handleOrderPatch(row.projectId, row.id, { purchase_notes: nextValue || null });
                          }
                        }}
                        disabled={savingItemId === row.id}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                      />
                      <Link
                        href={row.procurementState === "needs-vendor" ? "/materials" : `/projects/${row.projectId}`}
                        className="inline-block text-sm font-medium text-orange-600 hover:text-orange-700"
                      >
                        {row.procurementState === "needs-vendor" ? "Assign vendor" : "Open item"}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
