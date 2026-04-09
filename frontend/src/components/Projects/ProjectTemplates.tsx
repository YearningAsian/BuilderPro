"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/hooks/useStore";
import { formatCurrency, formatDate } from "@/lib/format";

type TemplateRow = {
  id: string;
  name: string;
  items: number;
  estimate: number;
  updatedAt: string;
};

export function ProjectTemplates() {
  const { projects, duplicateProject } = useStore();
  const router = useRouter();
  const [templateNameDraft, setTemplateNameDraft] = useState<Record<string, string>>({});
  const [projectNameDraft, setProjectNameDraft] = useState<Record<string, string>>({});
  const [savingActionId, setSavingActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const templates = useMemo<TemplateRow[]>(() => {
    return projects
      .filter((project) => project.name.startsWith("Template: "))
      .map((project) => ({
        id: project.id,
        name: project.name,
        items: project.items.length,
        estimate: project.items.reduce((sum, item) => sum + item.line_subtotal, 0),
        updatedAt: project.updated_at,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [projects]);

  const nonTemplates = useMemo<TemplateRow[]>(() => {
    return projects
      .filter((project) => !project.name.startsWith("Template: "))
      .map((project) => ({
        id: project.id,
        name: project.name,
        items: project.items.length,
        estimate: project.items.reduce((sum, item) => sum + item.line_subtotal, 0),
        updatedAt: project.updated_at,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [projects]);

  async function saveAsTemplate(projectId: string, sourceName: string) {
    const explicitName = templateNameDraft[projectId]?.trim();
    const name = explicitName || `Template: ${sourceName}`;

    setSavingActionId(projectId);
    setFeedback(null);
    try {
      const duplicated = await duplicateProject(projectId, {
        name,
        includeItems: true,
      });

      if (duplicated) {
        setFeedback(`Saved template ${duplicated.name}`);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save template");
    } finally {
      setSavingActionId(null);
    }
  }

  async function createFromTemplate(templateId: string, templateName: string) {
    const explicitName = projectNameDraft[templateId]?.trim();
    const normalizedTemplateName = templateName.replace(/^Template:\s*/, "");
    const name = explicitName || `${normalizedTemplateName} Project`;

    setSavingActionId(templateId);
    setFeedback(null);
    try {
      const duplicated = await duplicateProject(templateId, {
        name,
        includeItems: true,
      });

      if (duplicated) {
        setFeedback(`Created project ${duplicated.name}`);
        router.push(`/projects/${duplicated.id}`);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to create project from template");
    } finally {
      setSavingActionId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Save reusable estimate blueprints and spin up new projects faster.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Projects
        </Link>
      </div>

      <section className="card p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Create templates from existing projects</h2>
          <p className="text-sm text-gray-500">Template copies keep line items so they can be reused as estimate starting points.</p>
        </div>

        {nonTemplates.length === 0 ? (
          <p className="text-sm text-gray-500">No non-template projects available yet.</p>
        ) : (
          <div className="space-y-3">
            {nonTemplates.map((project) => (
              <div key={project.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                    <p className="text-xs text-gray-500">
                      {project.items} item(s) • {formatCurrency(project.estimate)} • Updated {formatDate(project.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      type="text"
                      value={templateNameDraft[project.id] ?? ""}
                      onChange={(event) =>
                        setTemplateNameDraft((prev) => ({
                          ...prev,
                          [project.id]: event.target.value,
                        }))
                      }
                      placeholder={`Template: ${project.name}`}
                      className="w-full sm:w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <button
                      type="button"
                      onClick={() => void saveAsTemplate(project.id, project.name)}
                      disabled={savingActionId === project.id}
                      className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                    >
                      Save as Template
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Use templates</h2>
          <p className="text-sm text-gray-500">Create a new project from a template and jump directly into editing.</p>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">No templates yet. Save one from the section above.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                    <p className="text-xs text-gray-500">
                      {template.items} item(s) • {formatCurrency(template.estimate)} • Updated {formatDate(template.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      type="text"
                      value={projectNameDraft[template.id] ?? ""}
                      onChange={(event) =>
                        setProjectNameDraft((prev) => ({
                          ...prev,
                          [template.id]: event.target.value,
                        }))
                      }
                      placeholder="New project name"
                      className="w-full sm:w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <button
                      type="button"
                      onClick={() => void createFromTemplate(template.id, template.name)}
                      disabled={savingActionId === template.id}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Create Project
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {feedback && <p className="text-sm text-gray-600">{feedback}</p>}
    </div>
  );
}
