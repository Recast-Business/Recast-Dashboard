import type { HouseResident, HouseUtilityPayment } from "@/types/finance";

/**
 * R5 follow-up — household share + combined-payment math.
 *
 * Two responsibilities, kept together so the splits stay consistent
 * across the grid panel and the new "Log House Payment" flow:
 *
 *   1. Per-resident utility share for a given month — equal-per-head
 *      across active residents, with the cent remainder absorbed so
 *      column sums reconcile exactly to the utility-bill totals.
 *
 *   2. Combined FIFO planner for a resident's payment — walks the
 *      resident's oldest unpaid months across (rent + utility share)
 *      and decides how much of the payment lands on each obligation,
 *      proportional to amount owed. Rounding diff goes to the larger
 *      portion (Gus's spec).
 */

// ─────────────────────────────────────────────────────────────────────
// Utility share helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * The resident chosen to absorb cent remainders when an equal-per-head
 * utility split doesn't divide evenly. Default rule (and the one
 * already used in UtilitySplitsPanel since Phase M-3b): whoever's
 * name contains "frazier" gets the remainder. If no Frazier exists,
 * the first resident in the list absorbs.
 */
export function pickCentRemainderResident(residents: HouseResident[]): number {
  const idx = residents.findIndex((r) =>
    r.name.toLowerCase().includes("frazier"),
  );
  return idx >= 0 ? idx : 0;
}

/**
 * Sum of every utility's amount for a single month. Used as the
 * per-month divisor for the equal-per-head split.
 */
export function utilityMonthTotal(
  utilByUtility: Record<string, Record<number, HouseUtilityPayment>> | undefined,
  month: number,
): number {
  if (!utilByUtility) return 0;
  let total = 0;
  for (const utilityId of Object.keys(utilByUtility)) {
    total += Number(utilByUtility[utilityId]?.[month]?.amount) || 0;
  }
  return total;
}

/**
 * The dollar share owed by `resident` for utilities in `month`.
 * Equal-per-head with cent remainder absorbed by the chosen resident
 * (see pickCentRemainderResident).
 */
export function utilityShareForResident(args: {
  residents: HouseResident[];
  residentIdx: number;
  monthTotal: number;
}): number {
  const { residents, residentIdx, monthTotal } = args;
  const activeCount = residents.length;
  if (activeCount === 0 || monthTotal <= 0) return 0;
  const totalCents = Math.round(monthTotal * 100);
  const baseCents = Math.floor(totalCents / activeCount);
  const remainderCents = totalCents - baseCents * activeCount;
  const remainderIdx = pickCentRemainderResident(residents);
  if (residentIdx === remainderIdx) {
    return (baseCents + remainderCents) / 100;
  }
  return baseCents / 100;
}

// ─────────────────────────────────────────────────────────────────────
// Combined FIFO planner
// ─────────────────────────────────────────────────────────────────────

/**
 * One step of the combined FIFO walk — describes how much of a single
 * payment lands on (rent, utility) for one specific month.
 */
export interface CombinedAllocationStep {
  /** YYYY of the period being settled. */
  period_year: number;
  /** 1-indexed month being settled. */
  period_month: number;
  /** Dollars applied to the resident's rent row for this month. */
  rent_apply: number;
  /** Dollars applied to the resident's utility share for this month
   *  (sum of per-utility splits). */
  utility_apply: number;
  /** rent_apply + utility_apply — convenience for the caller. */
  total_apply: number;
}

export interface CombinedOweInput {
  /** Period year. */
  period_year: number;
  /** 1-indexed period month. */
  period_month: number;
  /** Resident's rent owed for this month (amount − amount_paid). */
  rent_owed: number;
  /** Resident's utility share owed for this month
   *  (utilityShareForResident − already-paid). */
  utility_owed: number;
}

/**
 * Plan how a single payment of `amount` should land across the
 * resident's oldest unpaid (rent + utility) months. Per Gus:
 *
 *   "if Charlotte pays $1,500 and she owes both rent and utilities
 *    for January, the payment should apply toward both rent and
 *    utilities together, starting with the oldest owed month. The
 *    payment should be applied proportionally based on what is owed
 *    across rent and utilities for that month."
 *
 * Proportional split per month:
 *
 *   apply_for_month = min(remaining, rent_owed + utility_owed)
 *   rent_apply      = round(apply_for_month * rent_owed / combined, 2)
 *   utility_apply   = apply_for_month - rent_apply
 *
 * Rounding rule (Gus #7): the cent diff from the rounding step goes
 * to whichever side has the larger raw share. The subtraction above
 * already puts the diff into utility_apply when rent_apply is
 * rounded down — so we explicitly check which side is larger and
 * swap if needed to honour the rule.
 *
 * `owedByMonth` must be pre-sorted oldest → newest. Months with
 * combined_owed ≤ 0 are skipped (paid already or no obligation).
 */
export function planCombinedAllocation(args: {
  amount: number;
  owedByMonth: CombinedOweInput[];
}): { steps: CombinedAllocationStep[]; unallocated: number } {
  const { amount } = args;
  let remaining = Math.max(0, Number(amount) || 0);
  const steps: CombinedAllocationStep[] = [];

  for (const m of args.owedByMonth) {
    if (remaining <= 0) break;
    const rentOwed = Math.max(0, Number(m.rent_owed) || 0);
    const utilityOwed = Math.max(0, Number(m.utility_owed) || 0);
    const combined = rentOwed + utilityOwed;
    if (combined <= 0) continue;

    const applyForMonth = Math.min(remaining, combined);
    // Use cents for the proportional split so the rounding rule is
    // exact + side-aware.
    const applyCents = Math.round(applyForMonth * 100);
    const combinedCents = Math.round(combined * 100);
    const rentOwedCents = Math.round(rentOwed * 100);

    let rentApplyCents: number;
    let utilityApplyCents: number;
    if (combinedCents === 0) {
      rentApplyCents = 0;
      utilityApplyCents = 0;
    } else {
      // Default: rent gets the floor share; the residual goes to
      // utility. Then apply Gus #7: if rent owed > utility owed,
      // any cent residual should land on rent instead.
      rentApplyCents = Math.floor((applyCents * rentOwedCents) / combinedCents);
      utilityApplyCents = applyCents - rentApplyCents;
      const residualWentTo: "rent" | "utility" =
        rentApplyCents * combinedCents === applyCents * rentOwedCents
          ? "rent" // no residual (perfect divide)
          : "utility";
      if (residualWentTo === "utility" && rentOwed > utilityOwed) {
        // Shift one cent off utility, onto rent.
        rentApplyCents += 1;
        utilityApplyCents -= 1;
      }
    }

    // Don't over-apply to either side. If the proportional share
    // exceeds what's actually owed (can happen on the last cent),
    // clamp + move the residual to the other side.
    if (rentApplyCents > rentOwedCents) {
      const excess = rentApplyCents - rentOwedCents;
      rentApplyCents = rentOwedCents;
      utilityApplyCents += excess;
    }
    const utilityOwedCents = Math.round(utilityOwed * 100);
    if (utilityApplyCents > utilityOwedCents) {
      const excess = utilityApplyCents - utilityOwedCents;
      utilityApplyCents = utilityOwedCents;
      rentApplyCents += excess;
    }

    const rentApply = rentApplyCents / 100;
    const utilityApply = utilityApplyCents / 100;
    steps.push({
      period_year: m.period_year,
      period_month: m.period_month,
      rent_apply: rentApply,
      utility_apply: utilityApply,
      total_apply: rentApply + utilityApply,
    });
    remaining -= rentApply + utilityApply;
  }

  return { steps, unallocated: Math.max(0, remaining) };
}
