import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(amount: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Compact currency for tight grid cells: $1.2K, $14K, $1.2M.
 * Falls back to the standard format below $1,000.
 */
export function formatUSDCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  if (abs < 1_000_000) {
    const k = amount / 1_000;
    // 1 decimal under 10K, none above to keep cells tight
    const decimals = abs < 10_000 ? 1 : 0;
    return `$${k.toFixed(decimals)}K`;
  }
  const m = amount / 1_000_000;
  return `$${m.toFixed(m < 10 ? 1 : 0)}M`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Round 3D.2 (Gustavo): strict past-month blocking for NEW entries.
 * A month is "open" iff it's the current calendar month or later.
 * Round 4 A.2 layers an admin override on top — see `useLockState`
 * for the hook that combines this rule with the unlocked_periods
 * table to produce the live answer.
 *
 * Returns true if the month accepts new entries by the base rule
 * (admin overrides not applied here).
 */
export function isMonthOpen(year: number, month: number): boolean {
  const now = new Date();
  const ny = now.getFullYear();
  const nm = now.getMonth() + 1; // 1..12
  if (year > ny) return true;
  if (year < ny) return false;
  return month >= nm;
}

/**
 * Round 4 A.2 (Gustavo): months within the trailing 6 months are
 * "recent" — edits to existing rows are allowed. Older months are
 * read-only by default and need an explicit unlock to edit. Combined
 * with the unlocked_periods table in `useLockState`.
 *
 * Counts back inclusive: if today is May 2026, recent months are
 * Dec 2025 through May 2026 (6 months counting the current month).
 */
export function isMonthRecent(year: number, month: number): boolean {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const target = new Date(year, month - 1, 1);
  return target >= cutoff;
}
