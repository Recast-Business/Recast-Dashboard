/**
 * Generic "sum a metric grouped by a key" — feeds the pie charts.
 *
 *   const buckets = groupSum(rows, {
 *     key: (r) => r.payment_method ?? "Unspecified",
 *     value: (r) => Number(r.amount) || 0,
 *   });
 *   //  → [{ name: "PayPal", value: 5400 }, { name: "Wire", value: 2100 }, …]
 */

export interface PieBucket {
  name: string;
  value: number;
}

interface GroupOptions<Row> {
  key: (row: Row) => string;
  value: (row: Row) => number;
  /** Drop buckets where value <= 0. Default true — pie charts can't show zero. */
  excludeZero?: boolean;
  /** Cap at the top N buckets and roll the rest into "Other". 0 = no cap. */
  topN?: number;
  /** Sort descending by value. Default true. */
  sortDesc?: boolean;
}

export function groupSum<Row>(rows: Row[], opts: GroupOptions<Row>): PieBucket[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = opts.key(r) || "Unspecified";
    const v = opts.value(r);
    if (!Number.isFinite(v)) continue;
    map.set(k, (map.get(k) ?? 0) + v);
  }
  let buckets: PieBucket[] = [];
  for (const [name, value] of map.entries()) {
    buckets.push({ name, value });
  }
  if (opts.excludeZero !== false) {
    buckets = buckets.filter((b) => b.value > 0);
  }
  if (opts.sortDesc !== false) {
    buckets.sort((a, b) => b.value - a.value);
  }
  if (opts.topN && buckets.length > opts.topN) {
    const head = buckets.slice(0, opts.topN);
    const tail = buckets.slice(opts.topN);
    const other = tail.reduce((s, b) => s + b.value, 0);
    head.push({ name: "Other", value: other });
    buckets = head;
  }
  return buckets;
}

/**
 * Filter a (period_year, period_month) row to a UI window. The window is
 * always within ONE calendar year (whichever year the user has selected),
 * so this just narrows by month.
 *
 * Phase M-0: extended with `last30` (effectively the same one-month window
 * as `current` for our row resolution, since periods are monthly buckets)
 * and `3m` (last 3 calendar months) so analytics matches what Frazier
 * asks for day-to-day.
 */
export type AnalyticsPeriod = "ytd" | "6m" | "3m" | "current" | "last30";

export function periodMonthRange(period: AnalyticsPeriod): { from: number; to: number } {
  const currentMonth = new Date().getMonth() + 1; // 1-12
  if (period === "current" || period === "last30") {
    // last30 ≈ current month at our monthly grain — performance rows are
    // bucketed monthly, so any sub-month window collapses to the current
    // month. The label is still useful as a UX shorthand for Frazier.
    return { from: currentMonth, to: currentMonth };
  }
  if (period === "3m") return { from: Math.max(1, currentMonth - 2), to: currentMonth };
  if (period === "6m") return { from: Math.max(1, currentMonth - 5), to: currentMonth };
  return { from: 1, to: 12 };
}
