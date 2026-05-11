import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Segmented control for picking a financial reporting window.
 *
 * Shape mirrors what Gustavo asked for: Current month / Last 30 days /
 * Last 3 months / Last 6 months / Last 12 months. Persists the choice
 * via storageKey so each section remembers its own window.
 *
 * Output is a [from, to] date pair (inclusive, midnight-aligned) plus
 * the symbolic value so consumers can branch (e.g. "current" → only
 * show this month's data; "12m" → year-over-year comparison).
 */

export type DateRangeKey =
  | "current"
  | "last30"
  | "last3m"
  | "last6m"
  | "last12m";

export interface DateRange {
  key: DateRangeKey;
  from: Date;
  to: Date;
  label: string;
}

const TABS: { key: DateRangeKey; label: string; short: string }[] = [
  { key: "current", label: "Current month", short: "Month" },
  { key: "last30", label: "Last 30 days", short: "30d" },
  { key: "last3m", label: "Last 3 months", short: "3m" },
  { key: "last6m", label: "Last 6 months", short: "6m" },
  { key: "last12m", label: "Last 12 months", short: "12m" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Resolve a key to a concrete [from, to] window using `now` as anchor. */
export function resolveDateRange(
  key: DateRangeKey,
  now: Date = new Date(),
): DateRange {
  const today = endOfDay(now);
  let from: Date;
  let label: string;

  switch (key) {
    case "current": {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      label = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      break;
    }
    case "last30":
      from = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
      label = "Last 30 days";
      break;
    case "last3m":
      from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      label = "Last 3 months";
      break;
    case "last6m":
      from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 5, 1));
      label = "Last 6 months";
      break;
    case "last12m":
      from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 11, 1));
      label = "Last 12 months";
      break;
  }

  return { key, from, to: today, label };
}

interface Props {
  value: DateRangeKey;
  onChange: (k: DateRangeKey) => void;
  /** When true, render only the short tab labels (for tight toolbars). */
  compact?: boolean;
  className?: string;
}

export function DateRangeTabs({ value, onChange, compact, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Date range"
      className={cn(
        "inline-flex items-center rounded-md border bg-muted/30 p-0.5 text-xs",
        className,
      )}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          title={t.label}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded-md px-2.5 py-1 transition",
            // Phase L: active tab uses hairline + bg fill, no shadow.
            value === t.key
              ? "border border-border bg-background text-foreground"
              : "border border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {compact ? t.short : t.label}
        </button>
      ))}
    </div>
  );
}

/** Hook helper — pairs the picker with its persisted state. */
export function useDateRange(
  storageKey: string,
  initial: DateRangeKey = "current",
): {
  key: DateRangeKey;
  setKey: (k: DateRangeKey) => void;
  range: DateRange;
} {
  const [key, setKeyRaw] = React.useState<DateRangeKey>(() => {
    if (typeof window === "undefined") return initial;
    const v = window.localStorage.getItem(storageKey);
    if (v && (v === "current" || v === "last30" || v === "last3m" || v === "last6m" || v === "last12m")) {
      return v as DateRangeKey;
    }
    return initial;
  });
  const setKey = React.useCallback(
    (k: DateRangeKey) => {
      setKeyRaw(k);
      try {
        window.localStorage.setItem(storageKey, k);
      } catch {
        /* ignore quota */
      }
    },
    [storageKey],
  );
  const range = React.useMemo(() => resolveDateRange(key), [key]);
  return { key, setKey, range };
}
