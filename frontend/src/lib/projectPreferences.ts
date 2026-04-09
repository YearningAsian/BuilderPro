const MARKUP_KEY_PREFIX = "builderpro_project_markup_pct:";

function storageKey(projectId: string): string {
  return `${MARKUP_KEY_PREFIX}${projectId}`;
}

export function getProjectMarkupPct(projectId: string, fallback = 15): number {
  if (typeof window === "undefined") return fallback;

  const raw = localStorage.getItem(storageKey(projectId));
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
    return fallback;
  }

  return parsed;
}

export function setProjectMarkupPct(projectId: string, value: number): void {
  if (typeof window === "undefined") return;

  const clamped = Math.max(0, Math.min(500, value));
  localStorage.setItem(storageKey(projectId), String(clamped));
}
