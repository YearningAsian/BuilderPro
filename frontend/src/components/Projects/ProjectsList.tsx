"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/hooks/useStore";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProjectStatus, SortConfig } from "@/types";

type ProjSortKey = "name" | "status" | "items" | "estimate" | "updated_at";

/**
 * Projects overview page:
 * - Lists all projects with status badges, item count, estimate
 * - Create-new-project inline form
 * - Sortable columns
 */
export function ProjectsList() {
  const { projects, customers, createProject, duplicateProject, getCustomerById } = useStore();
  const router = useRouter();

  // ── New project form ──
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCustomerId, setNewCustomerId] = useState(customers[0]?.id ?? "");
  const [duplicateNameDraft, setDuplicateNameDraft] = useState<Record<string, string>>({});
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    if (!newName.trim() || !newCustomerId) return;
    createProject(newName.trim(), newCustomerId);
    setNewName("");
    setShowForm(false);
  }, [newName, newCustomerId, createProject]);

  const runDuplication = useCallback(
    async (projectId: string, includeItems: boolean) => {
      const name = duplicateNameDraft[projectId]?.trim();
      setDuplicatingId(projectId);
      setFeedback(null);
      try {
        const duplicated = await duplicateProject(projectId, {
          name: name || undefined,
          includeItems,
        });
        if (duplicated) {
          setFeedback(`Created ${duplicated.name}`);
          router.push(`/projects/${duplicated.id}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to duplicate project";
        setFeedback(message);
      } finally {
        setDuplicatingId(null);
      }
    },
    [duplicateNameDraft, duplicateProject, router],
  );

  // ── Sort ──
  const [sort, setSort] = useState<SortConfig<ProjSortKey> | null>(null);
  const toggleSort = useCallback((key: ProjSortKey) => {
    setSort((prev) => {
      if (prev?.key === key)
        return prev.direction === "asc" ? { key, direction: "desc" } : null;
      return { key, direction: "asc" };
    });
  }, []);

  const sorted = useMemo(() => {
    const list = projects.map((p) => ({
      ...p,
      estimate: p.items.reduce((s, i) => s + i.line_subtotal, 0),
      itemCount: p.items.length,
    }));

    if (!sort) return list;

    return [...list].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sort.key) {
        case "items":
          av = a.itemCount;
          bv = b.itemCount;
          break;
        case "estimate":
          av = a.estimate;
          bv = b.estimate;
          break;
        default:
          av = (a as Record<string, unknown>)[sort.key] as string;
          bv = (b as Record<string, unknown>)[sort.key] as string;
      }
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [projects, sort]);

  const arrow = (key: ProjSortKey) =>
    sort?.key === key ? (sort.direction === "asc" ? " ▲" : " ▼") : "";

  const STATUS_COLORS: Record<ProjectStatus, string> = {
    active: "bg-green-100 text-green-700",
    draft: "bg-yellow-100 text-yellow-700",
    closed: "bg-gray-200 text-gray-600",
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/projects/templates"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Templates
          </Link>
          <button
            onClick={() => setShowForm((o) => !o)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
        </div>
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="card p-4 flex flex-col sm:flex-row gap-3 animate-fade-in">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <select
            value={newCustomerId}
            onChange={(e) => setNewCustomerId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => setShowForm(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="bp-table">
          <thead>
            <tr>
              <th className="cursor-pointer" onClick={() => toggleSort("name")}>
                Name<span className="text-orange-500">{arrow("name")}</span>
              </th>
              <th>Customer</th>
              <th className="cursor-pointer" onClick={() => toggleSort("status")}>
                Status<span className="text-orange-500">{arrow("status")}</span>
              </th>
              <th className="cursor-pointer" onClick={() => toggleSort("items")}>
                Items<span className="text-orange-500">{arrow("items")}</span>
              </th>
              <th className="cursor-pointer text-right" onClick={() => toggleSort("estimate")}>
                Estimate<span className="text-orange-500">{arrow("estimate")}</span>
              </th>
              <th className="cursor-pointer" onClick={() => toggleSort("updated_at")}>
                Updated<span className="text-orange-500">{arrow("updated_at")}</span>
              </th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  No projects yet — create your first one above.
                </td>
              </tr>
            ) : (
              sorted.map((p) => {
                const customer = getCustomerById(p.customer_id);
                return (
                  <tr key={p.id}>
                    <td className="font-medium text-gray-900">
                      <Link
                        href={`/projects/${p.id}`}
                        className="hover:text-orange-600 transition-colors"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="text-gray-600">{customer?.name ?? "—"}</td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                          STATUS_COLORS[p.status as ProjectStatus] ?? STATUS_COLORS.draft
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>{p.itemCount}</td>
                    <td className="text-right font-mono">
                      {formatCurrency(p.estimate)}
                    </td>
                    <td className="text-gray-500 text-sm">
                      {formatDate(p.updated_at)}
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="text"
                          value={duplicateNameDraft[p.id] ?? ""}
                          onChange={(e) =>
                            setDuplicateNameDraft((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional copy name"
                          className="w-44 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-300"
                        />
                        <button
                          type="button"
                          onClick={() => void runDuplication(p.id, true)}
                          disabled={duplicatingId === p.id}
                          className="px-2.5 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          title="Duplicate with all line items"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => void runDuplication(p.id, false)}
                          disabled={duplicatingId === p.id}
                          className="px-2.5 py-1.5 text-xs font-medium rounded bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 disabled:opacity-50"
                          title="Create a template project without line items"
                        >
                          Template
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {feedback && (
        <p className="text-sm text-gray-600">{feedback}</p>
      )}
    </div>
  );
}
