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
