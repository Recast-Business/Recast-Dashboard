import * as React from "react";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyticsPeriod } from "@/lib/analytics/group";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "current", label: "Current month" },
  { value: "6m", label: "Last 6 months" },
  { value: "ytd", label: "YTD" },
];

interface Props {
  /** Section title (e.g. "Vendors analytics"). */
  title?: string;
  /** Storage key so each section remembers its own collapsed/period state. */
  storageKey: string;
  /** Render-prop receives the active period and renders the chart cards. */
  children: (period: AnalyticsPeriod) => React.ReactNode;
  /** Default collapsed. Pass `defaultOpen` to start expanded. */
  defaultOpen?: boolean;
}

/**
 * Collapsible analytics block: header w/ period chips + section title +
 * a render-prop area where consumers drop their <PieCard> components.
 *
 * State (period + open) is per-section, persisted in localStorage.
 */
export function AnalyticsPanel({ title = "Analytics", storageKey, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useStoredState(`${storageKey}.open`, defaultOpen);
  const [period, setPeriod] = useStoredState<AnalyticsPeriod>(`${storageKey}.period`, "ytd");

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/30"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeriod(p.value);
                if (!open) setOpen(true);
              }}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition",
                period === p.value
                  ? "bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </button>

      {open && (
        <div className="border-t p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children(period)}
          </div>
        </div>
      )}
    </div>
  );
}

// Tiny localStorage-backed useState. SSR-safe (returns default on server).
function useStoredState<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  });
  const set = React.useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* quota exceeded — ignore */
      }
    },
    [key],
  );
  return [value, set];
}
