import * as React from "react";
import { EyebrowLabel } from "./EyebrowLabel";
import { cn } from "@/lib/utils";

/**
 * Canonical page-shell primitives.
 *
 * Two pieces:
 *
 *   • PageHeader — top breadcrumb strip + EyebrowLabel + 38px h1 +
 *                  description + optional right-side actions slot.
 *                  Matches every Workspace/Pipeline section header.
 *
 *   • MetricStrip + MetricTile — 4-up tile row that accepts string
 *                                values so counts, currencies, rates,
 *                                and statuses render through one
 *                                component. For money-only tiles with
 *                                sparklines + deltaPct pills, reach
 *                                for the older `KpiTile` in this same
 *                                folder — that one is purpose-built
 *                                for Finance/Overview/Tax-style $-KPIs.
 *
 * History:
 *   • Originally lived at `src/components/layout/PipelineSection.tsx`
 *     as `PipelineHeader` / `PipelineKpiStrip` / `PipelineKpiTile`
 *     when only the Pipeline pages used it (Sweep b147ad2).
 *   • Promoted into `recast/` once Payments / TalentDetail /
 *     TalentLedger / TaxTracker also adopted the same shape and
 *     stopped rolling their own.
 */

// ─────────────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  /** Top breadcrumb strip e.g. "Pipeline · Brief Builder". */
  breadcrumb: string;
  /** EyebrowLabel under the strip — short context phrase. */
  eyebrow: string;
  /** Page title (rendered at 38px Unbounded). */
  title: string;
  /** Optional description paragraph. */
  description?: React.ReactNode;
  /** Right-side action slot (button, year picker, export, etc.). */
  actions?: React.ReactNode;
}

export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <>
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        {breadcrumb}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <EyebrowLabel withRule>{eyebrow}</EyebrowLabel>
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MetricStrip + MetricTile
// ─────────────────────────────────────────────────────────────────────

export type MetricTone = "default" | "paid" | "partial" | "overdue";

export interface MetricTile {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ComponentType<{
    className?: string;
    strokeWidth?: number | string;
  }>;
  tone?: MetricTone;
  /** Round-1 efficiency: when set, the tile renders as a button —
   *  used to make KPI counts drill into a pre-filtered list instead
   *  of being display-only (e.g. "Awaiting payment: 8" → click →
   *  status filter flips to awaiting). */
  onClick?: () => void;
}

export function MetricStrip({ tiles }: { tiles: MetricTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((t, i) => (
        <MetricCell key={i} tile={t} />
      ))}
    </div>
  );
}

function MetricCell({ tile }: { tile: MetricTile }) {
  const { label, value, sub, icon: Icon, tone = "default", onClick } = tile;
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-steel">
        {Icon ? <Icon className="h-3 w-3" strokeWidth={1.5} /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "tabular mt-3 font-display text-h2 font-extrabold leading-none",
          tone === "paid" && "text-paid",
          tone === "overdue" && "text-overdue",
          tone === "partial" && "text-partial",
          tone === "default" && "text-white",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-steel">{sub}</div> : null}
    </>
  );

  const shell = cn(
    "rounded-lg border bg-card p-4",
    tone === "paid" && "border-t border-t-paid",
    tone === "partial" && "border-t border-t-partial",
    tone === "overdue" && "border-t border-t-overdue",
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          shell,
          "block w-full text-left transition-colors duration-base ease-out hover:border-electric/40 hover:bg-white/[0.03]",
        )}
        title={`Filter by ${label.toLowerCase()}`}
      >
        {inner}
      </button>
    );
  }

  return <div className={shell}>{inner}</div>;
}
