import type { PaymentStatusV2 } from "@/types/finance";

/**
 * R5 follow-up — render-time effective status for invoice / payment cells.
 *
 * Per Gus: "Invoice status should update automatically. If it passes
 * the due date and remains unpaid, the monthly square should
 * automatically turn red/overdue. I don't want to manually change
 * that status."
 *
 * The DB still stores a `status` column (legacy + audit log), but the
 * grid renders the COMPUTED effective status. No cron, no scheduled
 * job, always-correct relative to today. The stored value becomes the
 * user-set hint (e.g. mark partial when they receive a $500 partial
 * payment against a $1500 invoice).
 *
 * Decision tree (in order):
 *
 *   1. amount_paid >= amount               → 'paid'
 *   2. amount_paid > 0 && < amount         → 'partial'
 *   3. deadline already passed             → 'overdue'
 *   4. otherwise                            → 'unpaid'
 *
 * Deadline source per side:
 *
 *   • Talent Paying Us (talent_invoices)   → row.due_date (explicit)
 *   • Talent We Pay    (vendor_payments)   → end-of-month for the
 *                                            row's (period_year,
 *                                            period_month) — vendor
 *                                            payments don't carry
 *                                            their own due_date and
 *                                            this matches the
 *                                            derive_status() RPC in
 *                                            migration 0027.
 */

export interface InvoiceLike {
  /** Total amount owed/invoiced (always > 0). */
  amount: number;
  /** Amount already paid against this row (0 = unpaid). */
  amount_paid: number;
  /** Explicit due date (talent_invoices.due_date). When absent the
   *  caller should pass `periodYear`/`periodMonth` so the helper can
   *  derive end-of-month. */
  due_date?: string | null;
  /** Used when due_date is null (vendor_payments side). */
  period_year?: number;
  period_month?: number;
}

/**
 * Resolve the deadline date for an invoice-like row. Returns null if
 * neither due_date nor (period_year, period_month) is set — caller
 * should treat that as "no deadline information" and avoid the
 * overdue branch.
 */
export function resolveDeadline(inv: InvoiceLike): Date | null {
  if (inv.due_date) return new Date(inv.due_date);
  if (inv.period_year != null && inv.period_month != null) {
    // Period EOM = first day of the next month minus one day. Using
    // Date(year, monthIdx, 0) where monthIdx == period_month gives
    // the last day of period_month (Date's month arg is 0-indexed).
    return new Date(inv.period_year, inv.period_month, 0, 23, 59, 59, 999);
  }
  return null;
}

/**
 * Compute the effective payment status for a row, ignoring whatever
 * is stored in the DB. Order of evaluation:
 *
 *   1. paid (paid >= owed)
 *   2. partial (0 < paid < owed)
 *   3. overdue (deadline passed)
 *   4. unpaid (default)
 *
 * `now` is injectable so tests can drive the clock.
 */
export function effectiveInvoiceStatus(
  inv: InvoiceLike,
  now: Date = new Date(),
): PaymentStatusV2 {
  const amount = Number(inv.amount) || 0;
  const paid = Number(inv.amount_paid) || 0;
  if (amount <= 0) return "unpaid";
  if (paid >= amount) return "paid";
  if (paid > 0) return "partial";
  const deadline = resolveDeadline(inv);
  if (deadline && deadline.getTime() < now.getTime()) return "overdue";
  return "unpaid";
}
