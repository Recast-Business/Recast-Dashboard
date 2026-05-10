import * as React from "react";
import { cn, formatUSD } from "@/lib/utils";
import type { PillStatus } from "./StatusPill";

/**
 * Phase L primitive: the cell-is-the-invoice grid cell.
 *
 * On the Talent / Vendor invoice grid, every cell is a button. The
 * cell shows amount + invoice ref (INV-####). Status is communicated
 * by the cell's left border colour (paid/partial/overdue/unpaid).
 *
 * Click → opens the invoice editor / detail dialog. The grid container
 * is responsible for layout (sticky-left creator column, "now" cursor,
 * etc.); this primitive is just one tile.
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
}

const BORDER: Record<PillStatus, string> = {
  paid: "border-l-paid",
  partial: "border-l-partial",
  overdue: "border-l-overdue",
  unpaid: "border-l-unpaid",
  awaiting: "border-l-unpaid",
};

export const InvoiceCell = React.forwardRef<HTMLButtonElement, InvoiceCellProps>(
  ({ amount, ref_, status, future, className, ...rest }, ref) => (
    <button
      type="button"
      ref={ref}
      className={cn(
        "block w-full rounded-sm border border-rule border-l-2 bg-card p-2 text-left transition-colors duration-base ease-out hover:bg-electric/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric",
        BORDER[status],
        future && "opacity-50",
        className,
      )}
      {...rest}
    >
      <div className="tabular text-body text-foreground">{formatUSD(amount, { decimals: 0 })}</div>
      <div className="text-eyebrow text-steel">{ref_}</div>
    </button>
  ),
);
InvoiceCell.displayName = "InvoiceCell";
