"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { formatCurrency, formatDate, truncate } from "@/lib/format";
import { ordersApi } from "@/services/api";
import type { OrderStatus, ProjectItem, ProjectStatus, PurchaseOrder } from "@/types";

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
  expectedDeliveryAt: string | null;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
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

type ShipmentTimelineItem = {
  id: string;
  projectId: string;
  projectName: string;
  materialName: string;
  vendorName: string;
  orderStatus: OrderStatus;
  expectedDeliveryAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  trackingNumber: string;
  trackingUrl: string;
  carrier: string;
  total: number;
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
const PROCUREMENT_FILTER_OPTIONS: Array<ProcurementState | "all"> = [
  "all",
  "ready",
  "needs-vendor",
  "planning",
  "ordered",
  "closed",
];

export function OrdersList() {
  const { projects, getMaterialById, getVendorById, updateProjectItem, refreshData } = useStore();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [procurementFilter, setProcurementFilter] = useState<ProcurementState | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [textFilter, setTextFilter] = useState("");
  const [orderItems, setOrderItems] = useState<ProjectItem[]>([]);
  const [isLoadingOrderItems, setIsLoadingOrderItems] = useState(true);
  const [orderItemsError, setOrderItemsError] = useState("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [savingBatchVendorId, setSavingBatchVendorId] = useState<string | null>(null);
  const [vendorPoNumbers, setVendorPoNumbers] = useState<Record<string, string>>({});
  const [vendorEtas, setVendorEtas] = useState<Record<string, string>>({});
  const [vendorCarriers, setVendorCarriers] = useState<Record<string, string>>({});
  const [vendorTrackingNumbers, setVendorTrackingNumbers] = useState<Record<string, string>>({});
  const [vendorTrackingUrls, setVendorTrackingUrls] = useState<Record<string, string>>({});
  const [batchStatusMessage, setBatchStatusMessage] = useState<string>("");
  const [batchErrorMessage, setBatchErrorMessage] = useState<string>("");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [isLoadingPurchaseOrders, setIsLoadingPurchaseOrders] = useState(true);
  const [purchaseOrderError, setPurchaseOrderError] = useState("");
  const [creatingVendorId, setCreatingVendorId] = useState<string | null>(null);
  const [poNumbers, setPoNumbers] = useState<Record<string, string>>({});
  const [poNotes, setPoNotes] = useState<Record<string, string>>({});
  const [poEtas, setPoEtas] = useState<Record<string, string>>({});
  const [poCarriers, setPoCarriers] = useState<Record<string, string>>({});
  const [poTrackingNumbers, setPoTrackingNumbers] = useState<Record<string, string>>({});
  const [poTrackingUrls, setPoTrackingUrls] = useState<Record<string, string>>({});
  const [updatingPoNumber, setUpdatingPoNumber] = useState<string | null>(null);

  const orderRows = useMemo<OrderRow[]>(() => {
    return orderItems
      .map((item) => {
        const project = projects.find((entry) => entry.id === item.project_id);
        const material = getMaterialById(item.material_id);
        const vendor = material?.default_vendor_id
          ? getVendorById(material.default_vendor_id)
          : undefined;

        const projectStatus = project?.status ?? "draft";
        const vendorName = vendor?.name ?? "Vendor not assigned";
        const orderStatus = item.order_status ?? "draft";
        const procurementState: ProcurementState =
          orderStatus === "received" || orderStatus === "cancelled" || projectStatus === "closed"
            ? "closed"
            : orderStatus === "ordered"
              ? "ordered"
              : vendor
                ? projectStatus === "active"
                  ? "ready"
                  : "planning"
                : "needs-vendor";

        return {
          id: item.id,
          projectId: item.project_id,
          projectName: project?.name ?? "Unknown project",
          materialId: item.material_id,
          materialName: material?.name ?? "Unknown material",
          vendorId: vendor?.id ?? null,
          vendorName,
          vendorEmail: vendor?.email ?? null,
          orderStatus,
          procurementState,
          status: projectStatus,
          quantityLabel: `${item.total_qty.toFixed(2)} ${item.unit_type}`,
          total: item.line_subtotal,
          updatedAt: item.updated_at,
          orderedAt: item.ordered_at,
          receivedAt: item.received_at,
          poNumber: item.po_number ?? "",
          purchaseNotes: item.purchase_notes ?? "",
          expectedDeliveryAt: item.expected_delivery_at,
          carrier: item.carrier ?? "",
          trackingNumber: item.tracking_number ?? "",
          trackingUrl: item.tracking_url ?? "",
          notes: item.notes,
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orderItems, projects, getMaterialById, getVendorById]);

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
        const procurementMatch = procurementFilter === "all" || row.procurementState === procurementFilter;
        const projectMatch = projectFilter === "all" || row.projectName === projectFilter;
        const vendorMatch = vendorFilter === "all" || row.vendorName === vendorFilter;
        const normalizedText = textFilter.trim().toLowerCase();
        const textMatch =
          normalizedText.length === 0 ||
          [
            row.projectName,
            row.materialName,
            row.vendorName,
            row.poNumber,
            row.trackingNumber,
            row.carrier,
            row.notes ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedText);
        return statusMatch && procurementMatch && projectMatch && vendorMatch && textMatch;
      }),
    [orderRows, statusFilter, procurementFilter, projectFilter, vendorFilter, textFilter],
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

  const overdueCount = useMemo(
    () =>
      filteredRows.filter((row) => {
        if (!row.expectedDeliveryAt || row.orderStatus === "received") return false;
        return new Date(row.expectedDeliveryAt).getTime() < Date.now();
      }).length,
    [filteredRows],
  );

  const missingTrackingCount = useMemo(
    () =>
      filteredRows.filter(
        (row) =>
          row.orderStatus === "ordered" &&
          !row.trackingNumber.trim() &&
          !row.trackingUrl.trim(),
      ).length,
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

  useEffect(() => {
    let active = true;

    async function loadOrderItems() {
      setIsLoadingOrderItems(true);
      setOrderItemsError("");
      try {
        const nextItems = await ordersApi.list();
        if (!active) return;
        setOrderItems(nextItems);
      } catch (error) {
        if (!active) return;
        setOrderItemsError(error instanceof Error ? error.message : "Unable to load order lines.");
      } finally {
        if (active) {
          setIsLoadingOrderItems(false);
        }
      }
    }

    async function loadPurchaseOrders() {
      setIsLoadingPurchaseOrders(true);
      setPurchaseOrderError("");
      try {
        const nextOrders = await ordersApi.listPurchaseOrders();
        if (!active) return;
        setPurchaseOrders(nextOrders);
      } catch (error) {
        if (!active) return;
        setPurchaseOrderError(error instanceof Error ? error.message : "Unable to load purchase orders.");
      } finally {
        if (active) {
          setIsLoadingPurchaseOrders(false);
        }
      }
    }

    void loadOrderItems();
    void loadPurchaseOrders();

    return () => {
      active = false;
    };
  }, []);

  async function reloadOrderItems() {
    const nextItems = await ordersApi.list();
    setOrderItems(nextItems);
  }

  const shipmentTimeline = useMemo<ShipmentTimelineItem[]>(() => {
    return filteredRows
      .filter(
        (row) =>
          row.orderStatus === "ordered" ||
          row.orderStatus === "received" ||
          row.expectedDeliveryAt !== null ||
          Boolean(row.trackingNumber),
      )
      .map((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: row.projectName,
        materialName: row.materialName,
        vendorName: row.vendorName,
        orderStatus: row.orderStatus,
        expectedDeliveryAt: row.expectedDeliveryAt,
        orderedAt: row.orderedAt,
        receivedAt: row.receivedAt,
        trackingNumber: row.trackingNumber,
        trackingUrl: row.trackingUrl,
        carrier: row.carrier,
        total: row.total,
      }))
      .sort((a, b) => {
        const aTime = new Date(a.expectedDeliveryAt || a.orderedAt || a.receivedAt || 0).getTime();
        const bTime = new Date(b.expectedDeliveryAt || b.orderedAt || b.receivedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [filteredRows]);

  async function handleOrderPatch(
    projectId: string,
    itemId: string,
    patch: Partial<{
      order_status: OrderStatus;
      po_number: string | null;
      purchase_notes: string | null;
      expected_delivery_at: string | null;
      carrier: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
    }>,
  ) {
    try {
      setSavingItemId(itemId);
      await updateProjectItem(projectId, itemId, patch);
      await reloadOrderItems();
    } catch (error) {
      console.warn("Failed to update purchase details", error);
    } finally {
      setSavingItemId((current) => (current === itemId ? null : current));
    }
  }

  function toIsoOrNull(value: string): string | null {
    if (!value.trim()) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  function toDatetimeLocalValue(value: string | null): string {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";

    const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
    const local = new Date(parsed.getTime() - offsetMs);
    return local.toISOString().slice(0, 16);
  }

  async function handleBatchStatusUpdate(
    vendorId: string,
    vendorName: string,
    fromStatus: "ready" | "ordered" | "received" | "draft" | "cancelled",
    nextStatus: OrderStatus,
  ) {
    const targetRows = vendorBatches.find((batch) => batch.vendorId === vendorId)?.rows ?? [];
    if (targetRows.length === 0) return;

    setBatchErrorMessage("");
    setBatchStatusMessage("");
    setSavingBatchVendorId(vendorId);

    const poNumber = vendorPoNumbers[vendorId]?.trim() ?? "";
    const expectedDeliveryAt = toIsoOrNull(vendorEtas[vendorId] ?? "");
    const carrier = vendorCarriers[vendorId]?.trim() ?? "";
    const trackingNumber = vendorTrackingNumbers[vendorId]?.trim() ?? "";
    const trackingUrl = vendorTrackingUrls[vendorId]?.trim() ?? "";

    try {
      const response = await ordersApi.bulkUpdateStatus({
        vendor_id: vendorId,
        from_status: fromStatus,
        to_status: nextStatus,
        po_number: poNumber || null,
        expected_delivery_at: expectedDeliveryAt,
        carrier: carrier || null,
        tracking_number: trackingNumber || null,
        tracking_url: trackingUrl || null,
      });

      await refreshData();
      await reloadOrderItems();

      const actionLabel = nextStatus === "ordered" ? "ordered" : nextStatus === "received" ? "received" : nextStatus;
      setBatchStatusMessage(`Updated ${response.updated_count} line(s) for ${vendorName} to ${actionLabel}.`);
    } catch (error) {
      setBatchErrorMessage(
        error instanceof Error ? error.message : `Unable to update batch for ${vendorName}.`,
      );
    } finally {
      setSavingBatchVendorId((current) => (current === vendorId ? null : current));
    }
  }

  async function reloadPurchaseOrders() {
    const nextOrders = await ordersApi.listPurchaseOrders();
    setPurchaseOrders(nextOrders);
  }

  async function handleCreatePurchaseOrder(batch: VendorBatch) {
    const poNumber = (poNumbers[batch.vendorId] ?? "").trim();
    if (!poNumber) {
      setPurchaseOrderError(`Enter a PO number for ${batch.vendorName}.`);
      return;
    }

    if (batch.readyRows.length === 0) {
      setPurchaseOrderError(`No ready-to-order lines found for ${batch.vendorName}.`);
      return;
    }

    setPurchaseOrderError("");
    setCreatingVendorId(batch.vendorId);

    try {
      await ordersApi.createPurchaseOrder({
        vendor_id: batch.vendorId,
        po_number: poNumber,
        item_ids: batch.readyRows.map((row) => row.id),
        purchase_notes: (poNotes[batch.vendorId] ?? "").trim() || null,
        expected_delivery_at: toIsoOrNull(poEtas[batch.vendorId] ?? ""),
        carrier: (poCarriers[batch.vendorId] ?? "").trim() || null,
        tracking_number: (poTrackingNumbers[batch.vendorId] ?? "").trim() || null,
        tracking_url: (poTrackingUrls[batch.vendorId] ?? "").trim() || null,
      });
      await refreshData();
      await reloadOrderItems();
      await reloadPurchaseOrders();
      setBatchStatusMessage(`Created purchase order ${poNumber} for ${batch.vendorName}.`);
    } catch (error) {
      setPurchaseOrderError(error instanceof Error ? error.message : `Unable to create PO for ${batch.vendorName}.`);
    } finally {
      setCreatingVendorId((current) => (current === batch.vendorId ? null : current));
    }
  }

  async function handleUpdatePurchaseOrder(
    poNumber: string,
    patch: Partial<{
      purchase_notes: string | null;
      expected_delivery_at: string | null;
      carrier: string | null;
      tracking_number: string | null;
      tracking_url: string | null;
      order_status: "ordered" | "received" | "cancelled";
    }>,
  ) {
    setPurchaseOrderError("");
    setUpdatingPoNumber(poNumber);
    try {
      await ordersApi.updatePurchaseOrder(poNumber, patch);
      await refreshData();
      await reloadOrderItems();
      await reloadPurchaseOrders();
    } catch (error) {
      setPurchaseOrderError(error instanceof Error ? error.message : `Unable to update ${poNumber}.`);
    } finally {
      setUpdatingPoNumber((current) => (current === poNumber ? null : current));
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

  async function openVendorPoDocument(vendorId: string, vendorName: string, includeStatus: "ready" | "ordered") {
    setBatchErrorMessage("");

    try {
      const html = await ordersApi.vendorPoDocumentHtml(vendorId, includeStatus);
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) {
        setBatchErrorMessage("Popup blocked. Allow popups and try again to open the PO document.");
        return;
      }

      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.document.title = `Purchase Order - ${vendorName}`;
      popup.focus();
    } catch (error) {
      setBatchErrorMessage(
        error instanceof Error ? error.message : `Unable to generate purchase order document for ${vendorName}.`,
      );
    }
  }

  async function openPurchaseOrderDocument(poNumber: string) {
    setPurchaseOrderError("");

    try {
      const html = await ordersApi.purchaseOrderDocumentHtml(poNumber);
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) {
        setPurchaseOrderError("Popup blocked. Allow popups and try again to open the PO document.");
        return;
      }

      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.document.title = `Purchase Order - ${poNumber}`;
      popup.focus();
    } catch (error) {
      setPurchaseOrderError(
        error instanceof Error ? error.message : `Unable to generate purchase order document for ${poNumber}.`,
      );
    }
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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overdue deliveries</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{overdueCount}</p>
          <p className="text-sm text-gray-500">Ordered lines with ETA already in the past</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Missing tracking</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{missingTrackingCount}</p>
          <p className="text-sm text-gray-500">Ordered lines without tracking number or tracking URL</p>
        </div>
      </div>

      {orderItemsError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {orderItemsError}
        </p>
      )}

      <section className="card p-5 space-y-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Purchase Orders</h2>
            <p className="text-sm text-gray-500">
              Create grouped purchase orders from ready vendor lines, then track delivery and receiving at the PO level.
            </p>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {isLoadingPurchaseOrders ? "Loading…" : `${purchaseOrders.length} PO${purchaseOrders.length === 1 ? "" : "s"}`}
          </div>
        </div>

        {(purchaseOrderError || batchStatusMessage) && (
          <div className="space-y-2">
            {purchaseOrderError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{purchaseOrderError}</p>}
            {batchStatusMessage && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{batchStatusMessage}</p>}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          {vendorBatches
            .filter((batch) => batch.readyRows.length > 0)
            .map((batch) => (
              <article key={batch.vendorId} className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{batch.vendorName}</h3>
                    <p className="text-sm text-gray-500">
                      {batch.readyRows.length} ready line(s) across {batch.projectCount} project(s)
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {formatCurrency(batch.readyRows.reduce((sum, row) => sum + row.total, 0))}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm text-gray-600">
                    <span className="font-medium text-gray-700">PO number</span>
                    <input
                      value={poNumbers[batch.vendorId] ?? ""}
                      onChange={(event) => setPoNumbers((prev) => ({ ...prev, [batch.vendorId]: event.target.value }))}
                      placeholder="PO-2026-001"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Expected delivery</span>
                    <input
                      type="datetime-local"
                      value={poEtas[batch.vendorId] ?? ""}
                      onChange={(event) => setPoEtas((prev) => ({ ...prev, [batch.vendorId]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Carrier</span>
                    <input
                      value={poCarriers[batch.vendorId] ?? ""}
                      onChange={(event) => setPoCarriers((prev) => ({ ...prev, [batch.vendorId]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-600">
                    <span className="font-medium text-gray-700">Tracking number</span>
                    <input
                      value={poTrackingNumbers[batch.vendorId] ?? ""}
                      onChange={(event) => setPoTrackingNumbers((prev) => ({ ...prev, [batch.vendorId]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-600 md:col-span-2">
                    <span className="font-medium text-gray-700">Tracking URL</span>
                    <input
                      value={poTrackingUrls[batch.vendorId] ?? ""}
                      onChange={(event) => setPoTrackingUrls((prev) => ({ ...prev, [batch.vendorId]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-600 md:col-span-2">
                    <span className="font-medium text-gray-700">PO notes</span>
                    <textarea
                      rows={3}
                      value={poNotes[batch.vendorId] ?? ""}
                      onChange={(event) => setPoNotes((prev) => ({ ...prev, [batch.vendorId]: event.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCreatePurchaseOrder(batch)}
                  disabled={creatingVendorId === batch.vendorId}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creatingVendorId === batch.vendorId ? "Creating PO..." : "Create purchase order"}
                </button>
              </article>
            ))}
        </div>

        <div className="space-y-4">
          {purchaseOrders.map((order) => (
            <article key={order.po_number} className="rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{order.po_number}</h3>
                  <p className="text-sm text-gray-500">
                    {order.vendor_name} · {order.line_count} line(s) · Updated {formatDate(order.updated_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                    {order.order_status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {formatCurrency(order.total_amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openPurchaseOrderDocument(order.po_number)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Open document
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-700">ETA</span>
                  <input
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(order.expected_delivery_at)}
                    onBlur={(event) => {
                      const nextValue = toIsoOrNull(event.target.value);
                      if (nextValue !== order.expected_delivery_at) {
                        void handleUpdatePurchaseOrder(order.po_number, { expected_delivery_at: nextValue });
                      }
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-700">Carrier</span>
                  <input
                    defaultValue={order.carrier ?? ""}
                    onBlur={(event) => {
                      const nextValue = event.target.value.trim() || null;
                      if (nextValue !== (order.carrier ?? null)) {
                        void handleUpdatePurchaseOrder(order.po_number, { carrier: nextValue });
                      }
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-700">Tracking number</span>
                  <input
                    defaultValue={order.tracking_number ?? ""}
                    onBlur={(event) => {
                      const nextValue = event.target.value.trim() || null;
                      if (nextValue !== (order.tracking_number ?? null)) {
                        void handleUpdatePurchaseOrder(order.po_number, { tracking_number: nextValue });
                      }
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-700">Status</span>
                  <select
                    value={order.order_status}
                    onChange={(event) => void handleUpdatePurchaseOrder(order.po_number, { order_status: event.target.value as "ordered" | "received" | "cancelled" })}
                    disabled={updatingPoNumber === order.po_number}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="ordered">ordered</option>
                    <option value="received">received</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm text-gray-600 md:col-span-2 xl:col-span-4">
                  <span className="font-medium text-gray-700">Tracking URL</span>
                  <input
                    defaultValue={order.tracking_url ?? ""}
                    onBlur={(event) => {
                      const nextValue = event.target.value.trim() || null;
                      if (nextValue !== (order.tracking_url ?? null)) {
                        void handleUpdatePurchaseOrder(order.po_number, { tracking_url: nextValue });
                      }
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1 text-sm text-gray-600 md:col-span-2 xl:col-span-4">
                  <span className="font-medium text-gray-700">PO notes</span>
                  <textarea
                    rows={3}
                    defaultValue={order.lines[0]?.purchase_notes ?? ""}
                    onBlur={(event) => {
                      const nextValue = event.target.value.trim() || null;
                      if (nextValue !== (order.lines[0]?.purchase_notes ?? null)) {
                        void handleUpdatePurchaseOrder(order.po_number, { purchase_notes: nextValue });
                      }
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="py-2 pr-4 font-medium">Project</th>
                      <th className="py-2 pr-4 font-medium">Material</th>
                      <th className="py-2 pr-4 font-medium">Qty</th>
                      <th className="py-2 pr-4 font-medium">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.id} className="border-b border-gray-100 text-gray-700">
                        <td className="py-2 pr-4">{line.project_name}</td>
                        <td className="py-2 pr-4">{line.material_name}</td>
                        <td className="py-2 pr-4">{line.total_qty.toFixed(2)} {line.unit_type}</td>
                        <td className="py-2 pr-4">{formatCurrency(line.line_subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}

          {!isLoadingPurchaseOrders && purchaseOrders.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              No purchase orders yet. Create one from a vendor batch with ready line items.
            </div>
          )}
        </div>
      </section>

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

        <label className="space-y-1 text-sm text-gray-600 block">
          <span className="font-medium text-gray-700">Search lines</span>
          <input
            value={textFilter}
            onChange={(event) => setTextFilter(event.target.value)}
            placeholder="Search project, material, vendor, PO, carrier, tracking..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          />
        </label>

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

        <div className="flex flex-wrap items-center gap-2">
          {PROCUREMENT_FILTER_OPTIONS.map((option) => {
            const active = procurementFilter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setProcurementFilter(option)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-slate-800 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option === "all" ? "All procurement" : option}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setProcurementFilter("all");
              setProjectFilter("all");
              setVendorFilter("all");
              setTextFilter("");
            }}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Reset filters
          </button>
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
          <p className="text-sm text-gray-500">
            {isLoadingOrderItems ? "Loading order lines..." : "Assign vendors and add project line items to unlock vendor batching."}
          </p>
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
                          <div className="grid gap-2 md:grid-cols-2">
                            <input
                              type="datetime-local"
                              value={vendorEtas[batch.vendorId] ?? ""}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setVendorEtas((prev) => ({ ...prev, [batch.vendorId]: nextValue }));
                              }}
                              disabled={isSavingBatch}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                            />
                            <input
                              type="text"
                              value={vendorCarriers[batch.vendorId] ?? ""}
                              placeholder="Carrier"
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setVendorCarriers((prev) => ({ ...prev, [batch.vendorId]: nextValue }));
                              }}
                              disabled={isSavingBatch}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                            />
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <input
                              type="text"
                              value={vendorTrackingNumbers[batch.vendorId] ?? ""}
                              placeholder="Tracking number"
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setVendorTrackingNumbers((prev) => ({ ...prev, [batch.vendorId]: nextValue }));
                              }}
                              disabled={isSavingBatch}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                            />
                            <input
                              type="url"
                              value={vendorTrackingUrls[batch.vendorId] ?? ""}
                              placeholder="Tracking URL"
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setVendorTrackingUrls((prev) => ({ ...prev, [batch.vendorId]: nextValue }));
                              }}
                              disabled={isSavingBatch}
                              className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                void handleBatchStatusUpdate(batch.vendorId, batch.vendorName, "ready", "ordered");
                              }}
                              disabled={isSavingBatch || batch.readyRows.length === 0}
                              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
                            >
                              Mark ready as ordered ({batch.readyRows.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleBatchStatusUpdate(batch.vendorId, batch.vendorName, "ordered", "received");
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
                            <button
                              type="button"
                              onClick={() => {
                                void openVendorPoDocument(batch.vendorId, batch.vendorName, "ready");
                              }}
                              disabled={isSavingBatch}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                            >
                              Print ready PO / PDF
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

      <section className="card p-4 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Shipment timeline</h2>
            <p className="text-sm text-gray-500">
              Track ordered and received lines with ETA, carrier, and tracking references.
            </p>
          </div>
          <p className="text-sm text-gray-500">{shipmentTimeline.length} tracked shipment line(s)</p>
        </div>

        {shipmentTimeline.length === 0 ? (
          <p className="text-sm text-gray-500">No shipment activity yet. Mark lines as ordered to populate the timeline.</p>
        ) : (
          <div className="space-y-3">
            {shipmentTimeline.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {entry.materialName} · {entry.projectName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Vendor: {entry.vendorName} · Status: {entry.orderStatus}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>{entry.orderedAt ? `Ordered ${formatDate(entry.orderedAt)}` : "Not ordered"}</span>
                      <span>{entry.expectedDeliveryAt ? `ETA ${formatDate(entry.expectedDeliveryAt)}` : "ETA not set"}</span>
                      <span>{entry.receivedAt ? `Received ${formatDate(entry.receivedAt)}` : "Awaiting receipt"}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(entry.total)}</p>
                    <p className="text-xs text-gray-500">Carrier: {entry.carrier || "—"}</p>
                    {entry.trackingUrl ? (
                      <a
                        href={entry.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-orange-600 hover:text-orange-700"
                      >
                        Track shipment {entry.trackingNumber ? `(${entry.trackingNumber})` : ""}
                      </a>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Tracking {entry.trackingNumber || "not set"}
                      </p>
                    )}
                    <Link
                      href={`/projects/${entry.projectId}`}
                      className="block text-xs font-medium text-orange-600 hover:text-orange-700"
                    >
                      Open project line
                    </Link>
                  </div>
                </div>
              </div>
            ))}
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
                      <input
                        type="datetime-local"
                        defaultValue={toDatetimeLocalValue(row.expectedDeliveryAt)}
                        onBlur={(event) => {
                          const nextValue = toIsoOrNull(event.target.value);
                          const currentValue = row.expectedDeliveryAt ?? null;
                          if (nextValue !== currentValue) {
                            void handleOrderPatch(row.projectId, row.id, { expected_delivery_at: nextValue });
                          }
                        }}
                        disabled={savingItemId === row.id}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                      />
                      <input
                        type="text"
                        defaultValue={row.carrier}
                        placeholder="Carrier"
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim();
                          if (nextValue !== row.carrier) {
                            void handleOrderPatch(row.projectId, row.id, { carrier: nextValue || null });
                          }
                        }}
                        disabled={savingItemId === row.id}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                      />
                      <input
                        type="text"
                        defaultValue={row.trackingNumber}
                        placeholder="Tracking #"
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim();
                          if (nextValue !== row.trackingNumber) {
                            void handleOrderPatch(row.projectId, row.id, { tracking_number: nextValue || null });
                          }
                        }}
                        disabled={savingItemId === row.id}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                      />
                      <input
                        type="url"
                        defaultValue={row.trackingUrl}
                        placeholder="Tracking URL"
                        onBlur={(event) => {
                          const nextValue = event.target.value.trim();
                          if (nextValue !== row.trackingUrl) {
                            void handleOrderPatch(row.projectId, row.id, { tracking_url: nextValue || null });
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
