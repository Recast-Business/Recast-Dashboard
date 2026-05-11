import * as React from "react";
import { cn, formatUSD } from "@/lib/utils";
import type { PillStatus } from "./StatusPill";

/**
 * Phase L primitive: the cell-is-the-invoice grid cell.
 *
 * Used in the C2 talent invoice grid + C4 vendor recurring grid +
 * C5 house grid. Per canonical spec §11:
 *   • Cell tints in the talent grid use rgba() at 5–7% alpha
 *   • A 6×6 px corner pip in the top-right gives a redundant status
 *     signal in case the tint is too subtle on the engineer's monitor
 *   • Status is also communicated by the cell's left border colour
 *
 * Click → opens the invoice editor / detail dialog. The grid container
 * is responsible for sticky-left, "now" cursor, etc.; this primitive
 * is just one tile.
 *
 * See dashboard/docs/DESIGN.md "Invoice cell" recipe.
 */

interface InvoiceCellProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  amount: number;
  /** Invoice reference, e.g. "INV-0362". Renders below the amount. */
  ref_: string;
  status: PillStatus;
  /** Visually muted (e.g. months past the "now" cursor). */
  future?: boolean;
  /** Compact rendering — drops the INV ref to save vertical space. */
  compact?: boolean;
}

const BORDER: Record<PillStatus, string> = {
  paid: "border-l-paid",
  partial: "border-l-partial",
  overdue: "border-l-overdue",
  unpaid: "border-l-unpaid",
  awaiting: "border-l-unpaid",
};

// 5–7% alpha tints per spec §11. Unpaid stays untinted (default
// surface) because it's the resting state.
const TINT: Record<PillStatus, string> = {
  paid: "bg-paid/[0.05]",
  partial: "bg-partial/[0.05]",
  overdue: "bg-overdue/[0.06]",
  unpaid: "",
  awaiting: "",
};

// Corner pip colour — same hue as the left border for redundancy.
const PIP: Record<PillStatus, string> = {
  paid: "bg-paid",
  partial: "bg-partial",
  overdue: "bg-overdue",
  unpaid: "bg-unpaid/40",
  awaiting: "bg-unpaid/40",
};

export const InvoiceCell = React.forwardRef<HTMLButtonElement, InvoiceCellProps>(
  ({ amount, ref_, status, future, compact, className, ...rest }, ref) => (
    <button
      type="button"
      ref={ref}
      className={cn(
        // Card-style hover (per spec): subtle lighten, not a blue tint.
        "relative block w-full rounded-sm border border-rule border-l-2 p-2 text-left transition-colors duration-base ease-out hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric",
        BORDER[status],
        TINT[status],
        future && "opacity-50",
        className,
      )}
      {...rest}
    >
      {/* 6×6 corner pip — redundant status signal per spec §11.
          Hidden when the cell is "future" (no real invoice yet). */}
      {!future ? (
        <span
          aria-hidden
          className={cn(
            "absolute right-1 top-1 h-1.5 w-1.5 rounded-sm",
            PIP[status],
          )}
        />
      ) : null}
      {/* Money: Inter 500 14px tabular per spec — Unbounded per user
          override (Phase L C1.9). Invoice ref: meta treatment
          (Inter 500 / 11px / 0.04em / regular case + tabular). */}
      <div className="tabular font-display text-body font-bold text-foreground">
        {formatUSD(amount, { decimals: 0 })}
      </div>
      {!compact ? (
        <div className="tabular text-meta text-steel">{ref_}</div>
      ) : null}
    </button>
  ),
);
InvoiceCell.displayName = "InvoiceCell";
