"use client";

import Link from "next/link";
import { useStore } from "@/hooks/useStore";
import { RecordBuilder } from "@/components/Records/RecordBuilder";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
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
  const { getProjectById, getCustomerById } = useStore();
  const project = getProjectById(projectId);

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
      </div>

      {/* Record Builder */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Bill of Materials
        </h2>
        <RecordBuilder projectId={projectId} />
      </section>
    </div>
  );
}
