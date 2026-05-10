import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase L primitive: 4-state payment status pill.
 *
 * Status enum is fixed — never invent a fifth colour. If the data model
 * needs more states, the DB enum changes first, then this primitive is
 * extended (and DESIGN.md updated in the same commit).
 *
 * The DB still has a legacy `awaiting` status from M-3; treat it
 * visually as `unpaid` (both grey, both "issued, not yet paid") but
 * preserve its label so workflows that distinguish them stay clear.
 */

export type PillStatus = "paid" | "partial" | "overdue" | "unpaid" | "awaiting";

interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: PillStatus;
  /** Override the visible label; defaults to status uppercased. */
  label?: string;
}

const STYLE: Record<PillStatus, { tint: string; text: string; label: string }> = {
  paid: { tint: "bg-paid-tint", text: "text-paid", label: "PAID" },
  partial: { tint: "bg-partial-tint", text: "text-partial", label: "PARTIAL" },
  overdue: { tint: "bg-overdue-tint", text: "text-overdue", label: "OVERDUE" },
  unpaid: { tint: "bg-unpaid-tint", text: "text-unpaid", label: "UNPAID" },
  awaiting: { tint: "bg-unpaid-tint", text: "text-unpaid", label: "AWAITING" },
};

export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ status, label, className, ...rest }, ref) => {
    const s = STYLE[status];
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-sm px-2 py-0.5 text-eyebrow",
          s.tint,
          s.text,
          className,
        )}
        {...rest}
      >
        {label ?? s.label}
      </span>
    );
  },
);
StatusPill.displayName = "StatusPill";
