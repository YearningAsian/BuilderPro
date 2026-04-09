"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/hooks/useStore";
import { RecordBuilder } from "@/components/Records/RecordBuilder";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { getProjectMarkupPct, setProjectMarkupPct } from "@/lib/projectPreferences";
import { projectsApi } from "@/services/api";
import type { ProjectStatus } from "@/types";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: "bg-green-100 text-green-700",
  draft: "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-200 text-gray-600",
};

/**
 * Full project detail page:
 * - Header with project metadata (customer, status, tax, waste defaults)
 * - Embedded RecordBuilder for the bill-of-materials
 */
export function ProjectDetail({ projectId }: { projectId: string }) {
  const { customers, getProjectById, getCustomerById, updateProject } = useStore();
  const project = getProjectById(projectId);
  const [markupPct, setMarkupPct] = useState(15);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectFormError, setProjectFormError] = useState<string | null>(null);
  const [projectFormStatus, setProjectFormStatus] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: "",
    customer_id: "",
    status: "draft" as ProjectStatus,
    default_tax_pct: "0",
    default_waste_pct: "0",
  });

  const totals = useMemo(() => {
    const projectItems = project?.items ?? [];
    const defaultTaxPct = project?.default_tax_pct ?? 0;
    const costSubtotal = projectItems.reduce((sum, item) => sum + item.line_subtotal, 0);
    const markupAmount = costSubtotal * (markupPct / 100);
    const subtotalWithMarkup = costSubtotal + markupAmount;
    const taxAmount = subtotalWithMarkup * (defaultTaxPct / 100);
    const sellTotal = subtotalWithMarkup + taxAmount;
    return {
      costSubtotal,
      markupAmount,
      subtotalWithMarkup,
      taxAmount,
      sellTotal,
    };
  }, [markupPct, project?.default_tax_pct, project?.items]);

  useEffect(() => {
    if (!project) return;
    setMarkupPct(getProjectMarkupPct(project.id, 15));
  }, [project]);

  useEffect(() => {
    if (!project) return;
    setProjectForm({
      name: project.name,
      customer_id: project.customer_id,
      status: project.status,
      default_tax_pct: String(project.default_tax_pct),
      default_waste_pct: String(project.default_waste_pct),
    });
  }, [project]);

  if (!project) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p className="text-lg font-medium mb-2">Project not found</p>
        <Link href="/projects" className="text-orange-500 hover:underline text-sm">
          &larr; Back to projects
        </Link>
      </div>
    );
  }

  const customer = getCustomerById(project.customer_id);

  async function saveProjectDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectFormError(null);
    setProjectFormStatus(null);

    const normalizedName = projectForm.name.trim();
    if (!normalizedName) {
      setProjectFormError("Project name is required.");
      return;
    }

    if (!projectForm.customer_id) {
      setProjectFormError("Select a customer for this project.");
      return;
    }

    const defaultTaxPct = Number(projectForm.default_tax_pct);
    const defaultWastePct = Number(projectForm.default_waste_pct);

    if (!Number.isFinite(defaultTaxPct) || defaultTaxPct < 0 || defaultTaxPct > 100) {
      setProjectFormError("Default tax must be between 0 and 100.");
      return;
    }

    if (!Number.isFinite(defaultWastePct) || defaultWastePct < 0 || defaultWastePct > 100) {
      setProjectFormError("Default waste must be between 0 and 100.");
      return;
    }

    setIsSavingProject(true);
    try {
      await updateProject(project.id, {
        name: normalizedName,
        customer_id: projectForm.customer_id,
        status: projectForm.status,
        default_tax_pct: defaultTaxPct,
        default_waste_pct: defaultWastePct,
      });
      setProjectFormStatus("Project details updated.");
      setIsEditingProject(false);
    } catch (error) {
      setProjectFormError(error instanceof Error ? error.message : "Unable to update project details.");
    } finally {
      setIsSavingProject(false);
    }
  }

  function resetProjectForm() {
    if (!project) return;
    setProjectForm({
      name: project.name,
      customer_id: project.customer_id,
      status: project.status,
      default_tax_pct: String(project.default_tax_pct),
      default_waste_pct: String(project.default_waste_pct),
    });
    setProjectFormError(null);
    setProjectFormStatus(null);
    setIsEditingProject(false);
  }

  async function exportEstimatePdf() {
    if (!project) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const html = await projectsApi.estimateDocumentHtml(project.id, markupPct);
      const printWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!printWindow) {
        throw new Error("Popup blocked. Allow popups to export estimate PDF.");
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate estimate document.";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400">
        <Link href="/projects" className="hover:text-orange-500 transition-colors">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{project.name}</span>
      </nav>

      {/* Header card */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Customer: <span className="text-gray-700 font-medium">{customer?.name ?? "—"}</span>
            </p>
          </div>
          <span
            className={`self-start inline-block px-3 py-1 text-xs font-semibold rounded-full ${
              STATUS_COLORS[project.status] ?? STATUS_COLORS.draft
            }`}
          >
            {project.status}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setProjectFormError(null);
              setProjectFormStatus(null);
              setIsEditingProject((current) => !current);
            }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {isEditingProject ? "Hide editor" : "Edit project details"}
          </button>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-500">
          <div>
            Default Tax:{" "}
            <span className="font-medium text-gray-700">
              {formatPercent(project.default_tax_pct)}
            </span>
          </div>
          <div>
            Default Waste:{" "}
            <span className="font-medium text-gray-700">
              {formatPercent(project.default_waste_pct)}
            </span>
          </div>
          <div>
            Created:{" "}
            <span className="font-medium text-gray-700">
              {formatDate(project.created_at)}
            </span>
          </div>
          <div>
            Last Updated:{" "}
            <span className="font-medium text-gray-700">
              {formatDate(project.updated_at)}
            </span>
          </div>
        </div>

        {(isEditingProject || projectFormError || projectFormStatus) && (
          <form className="mt-5 grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 md:grid-cols-2" onSubmit={saveProjectDetails}>
            <label className="space-y-1 text-sm text-gray-700 md:col-span-2">
              <span className="font-medium">Project name</span>
              <input
                value={projectForm.name}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                disabled={!isEditingProject}
              />
            </label>

            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Customer</span>
              <select
                value={projectForm.customer_id}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, customer_id: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                disabled={!isEditingProject}
              >
                {customers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Status</span>
              <select
                value={projectForm.status}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, status: event.target.value as ProjectStatus }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                disabled={!isEditingProject}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>
            </label>

            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Default tax %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={projectForm.default_tax_pct}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, default_tax_pct: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                disabled={!isEditingProject}
              />
            </label>

            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">Default waste %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={projectForm.default_waste_pct}
                onChange={(event) => setProjectForm((prev) => ({ ...prev, default_waste_pct: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                disabled={!isEditingProject}
              />
            </label>

            {projectFormError && <p className="text-sm text-red-600 md:col-span-2">{projectFormError}</p>}
            {projectFormStatus && <p className="text-sm text-green-700 md:col-span-2">{projectFormStatus}</p>}

            {isEditingProject && (
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <button
                  type="submit"
                  disabled={isSavingProject}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                >
                  {isSavingProject ? "Saving..." : "Save project details"}
                </button>
                <button
                  type="button"
                  onClick={resetProjectForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Record Builder */}
      <section className="grid gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <h2 className="text-lg font-semibold text-gray-800">Markup Tracking</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track your projected sell value against material cost before sending the estimate.
          </p>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-4">
            <label className="text-sm text-gray-600">
              Target Markup %
              <input
                type="number"
                min={0}
                max={500}
                step={0.5}
                value={markupPct}
                onChange={(event) => {
                  const next = Number(event.target.value) || 0;
                  const clamped = Math.max(0, Math.min(500, next));
                  setMarkupPct(clamped);
                  if (project) {
                    setProjectMarkupPct(project.id, clamped);
                  }
                }}
                className="mt-1 block w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </label>

            <button
              type="button"
              onClick={() => void exportEstimatePdf()}
              disabled={isExporting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {isExporting ? "Preparing..." : "Export Estimate / PDF"}
            </button>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-gray-500">Cost Subtotal</p>
              <p className="font-semibold text-gray-900">{formatCurrency(totals.costSubtotal)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-gray-500">Markup Value</p>
              <p className="font-semibold text-gray-900">{formatCurrency(totals.markupAmount)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-gray-500">Subtotal + Markup</p>
              <p className="font-semibold text-gray-900">{formatCurrency(totals.subtotalWithMarkup)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-gray-500">Projected Sell Total</p>
              <p className="font-semibold text-gray-900">{formatCurrency(totals.sellTotal)}</p>
            </div>
          </div>

          {exportError && <p className="mt-3 text-sm text-red-600">{exportError}</p>}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Margin Snapshot</h3>
          <div className="mt-3 space-y-2 text-sm">
            <p className="flex justify-between"><span className="text-gray-500">Items</span><strong>{project.items.length}</strong></p>
            <p className="flex justify-between"><span className="text-gray-500">Tax Amount</span><strong>{formatCurrency(totals.taxAmount)}</strong></p>
            <p className="flex justify-between"><span className="text-gray-500">Markup %</span><strong>{formatPercent(markupPct)}</strong></p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Bill of Materials
        </h2>
        <RecordBuilder projectId={projectId} />
      </section>
    </div>
  );
}
