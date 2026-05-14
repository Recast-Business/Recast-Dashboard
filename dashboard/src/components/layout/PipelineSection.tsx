import * as React from "react";
import { EyebrowLabel } from "@/components/recast";
import { cn } from "@/lib/utils";

/**
 * Shared page-shell primitives for the Pipeline section pages
 * (Brief Builder, Campaigns, etc.) so they match the canonical aesthetic
 * used by Workspace pages (Vendors, House, Talent Ledger, Payments).
 *
 * Two primitives:
 *
 *   • PipelineHeader — top eyebrow strip + EyebrowLabel + 38px h1 +
 *                      description paragraph + optional right-side
 *                      actions slot. Matches Vendors / House / Roster.
 *
 *   • PipelineKpiStrip — 4-up tile row mirroring the Workspace KPI
 *                        frames (Talent Ledger's CountTile + Payments'
 *                        KpiTile pattern), but accepts string values so
 *                        counts, currencies, and rates all render
 *                        through one component.
 *
 * Local-to-page KpiTile implementations (TalentLedger CountTile,
 * Payments KpiTile, TalentDetail KpiTile) will eventually consolidate
 * onto this — for now this module is the source of truth for new work.
 */

interface PipelineHeaderProps {
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

export function PipelineHeader({
  breadcrumb,
  eyebrow,
  title,
  description,
  actions,
}: PipelineHeaderProps) {
  return (
    <>
      {/* Top eyebrow strip — canonical page anchor.  */}
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
// KPI strip
// ─────────────────────────────────────────────────────────────────────

export type PipelineKpiTone = "default" | "paid" | "partial" | "overdue";

export interface PipelineKpiTile {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ComponentType<{
    className?: string;
    strokeWidth?: number | string;
  }>;
  tone?: PipelineKpiTone;
}

export function PipelineKpiStrip({ tiles }: { tiles: PipelineKpiTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((t, i) => (
        <PipelineKpiCell key={i} tile={t} />
      ))}
    </div>
  );
}

function PipelineKpiCell({ tile }: { tile: PipelineKpiTile }) {
  const { label, value, sub, icon: Icon, tone = "default" } = tile;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "paid" && "border-t border-t-paid",
        tone === "partial" && "border-t border-t-partial",
        tone === "overdue" && "border-t border-t-overdue",
      )}
    >
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
    </div>
  );
}
