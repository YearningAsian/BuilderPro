/**
 * Shared formatting helpers used across the UI.
 * Centralised here to avoid magic numbers and duplicated locale logic.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DATE_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** e.g. "$1,234.56" */
export function formatCurrency(value: number): string {
  return USD.format(value);
}

/** e.g. "10.0%" — expects the raw percentage (10, not 0.10). */
export function formatPercent(value: number): string {
  return PCT.format(value / 100);
}

/** e.g. "Mar 1, 2026" */
export function formatDate(iso: string): string {
  return DATE_SHORT.format(new Date(iso));
}

/** Truncate text to a max length, appending "…" if needed. */
export function truncate(text: string | null, max = 40): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
