/**
 * Telegram + OnlyFans income calculations.
 *
 * Locked specs (from Gustavo overhaul Q&A):
 *   • Telegram net is fixed at 50% of gross (the platform takes 50% before commission).
 *   • Telegram MG qualifier: net >= 50% of MG → creator qualifies for top-up.
 *   • Top-up amount: max(0, MG - net) when qualified.
 *   • Recast commission applies to (net + top-up), NOT just net.
 *
 * OnlyFans is simpler — Recast takes a % of gross or net depending on the deal,
 * the rest is the creator's "girls share". No MG.
 *
 * Round 3 (Gustavo decision B): tier semantics flipped from CLIFF →
 * PROGRESSIVE (income-tax-bracket style).
 *   • Each tier's pct applies to its SLICE only. Threshold values mean
 *     "this tier starts at" (the legacy K-2 data shape stored exactly
 *     this — no migration needed; only the math reading it changes).
 *   • Example: tiers [{threshold:0, pct:30}, {threshold:10000, pct:20}]
 *     on a $15,000 gross →
 *       first $10,000 @ 30% = $3,000
 *       remaining $5,000 @ 20% = $1,000
 *       total commission = $4,000  (effective rate ≈ 26.7%)
 *     Under the old cliff rule, the same data → $15,000 × 20% = $3,000.
 *   • Backward compat: when tiers is null/undefined/empty the calc uses
 *     the deal's flat pct as before.
 *
 * Two helpers live below: `commissionDollarsFromTiers` returns the raw $
 * for previewing the breakdown, and `effectivePctFromTiers` returns the
 * derived effective % so callers that previously assumed a single rate
 * (commission_basis="net" multiplies that rate against the net base)
 * keep working with minimal change.
 */

export interface CommissionTier {
  /** Monthly gross >= this threshold → tier STARTS here (progressive). */
  threshold: number;
  /** Recast's cut on this slice, 0–100. */
  pct: number;
}

/**
 * Round 3: compute Recast's commission dollars under PROGRESSIVE
 * semantics. The slice between tier[i].threshold and tier[i+1].threshold
 * (or +Infinity for the last) gets tier[i].pct.
 *
 * Returns 0 when tiers is null/empty/zero gross — caller falls back to
 * the deal's flat pct in that case via effectivePctFromTiers().
 */
export function commissionDollarsFromTiers(
  gross: number,
  tiers: CommissionTier[] | null | undefined,
): number {
  if (!tiers || tiers.length === 0 || gross <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const tierStart = sorted[i].threshold;
    if (gross <= tierStart) break;
    const tierEnd =
      i + 1 < sorted.length ? sorted[i + 1].threshold : Infinity;
    const sliceWidth = Math.min(gross, tierEnd) - tierStart;
    total += sliceWidth * (sorted[i].pct / 100);
  }
  return round2(total);
}

/**
 * Derive an effective % from a progressive tier table for a given
 * gross. Returns null when no tiers supplied (caller falls back to the
 * deal's flat pct).
 *
 * The result is `commissionDollars / gross × 100` — a single rate that
 * captures the blended cost across all crossed tiers. Existing call
 * sites (calcOFPeriod, calcTelePeriod) multiply this against the
 * commission base (gross OR net depending on `basis`), so a progressive
 * tier table works under both `basis: "gross"` and `basis: "net"`.
 */
export function effectivePctFromTiers(
  gross: number,
  tiers: CommissionTier[] | null | undefined,
): number | null {
  if (!tiers || tiers.length === 0) return null;
  if (gross <= 0) {
    // Edge: no gross to slice. Return the FIRST tier's rate so a
    // "what would a $1 trial gross net me?" preview doesn't divide
    // by zero. Inert for the calc itself (commission = base × 0% = 0
    // when gross is 0, regardless of basis).
    const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
    return sorted[0].pct;
  }
  const dollars = commissionDollarsFromTiers(gross, tiers);
  return (dollars / gross) * 100;
}

/** Pull a tier array out of a creator's commission_pct_by_platform JSONB.
 *  Backwards-compat: a flat number or null returns null (calc engine
 *  falls back to the deal's flat pct in that case). */
export function tiersFromProfile(
  commissionByPlatform: unknown,
  platform: "onlyfans" | "telegram" | "efuse",
): CommissionTier[] | null {
  if (!commissionByPlatform || typeof commissionByPlatform !== "object") return null;
  const map = commissionByPlatform as Record<string, unknown>;
  const v = map[platform];
  if (!Array.isArray(v)) return null;
  // Sanity-filter so a malformed JSONB row doesn't crash the calc.
  const out: CommissionTier[] = [];
  for (const t of v as Array<Record<string, unknown>>) {
    if (typeof t?.threshold === "number" && typeof t?.pct === "number") {
      out.push({ threshold: t.threshold, pct: t.pct });
    }
  }
  return out.length > 0 ? out : null;
}

const TELEGRAM_PLATFORM_NET_RATIO = 0.5;
const TELEGRAM_MG_QUALIFIER_RATIO = 0.5;

export interface TelePeriodCalc {
  gross_revenue: number;
  net_revenue: number;            // typically 0.5 × gross
  qualified_for_mg: boolean;
  mg_top_up: number;              // amount Telegram tops the creator up to MG
  recast_commission: number;      // Recast's cut, applied to (net + top-up)
  creator_take_home: number;      // (net + top-up) − recast_commission
}

export interface TelePeriodInput {
  gross_revenue: number;
  net_revenue?: number;           // optional override; defaults to 50% of gross
  recast_commission_pct: number;  // e.g. 20 for 20% (used when tiers is null/empty)
  commission_basis: "gross" | "net";
  min_guarantee?: number | null;  // null = no MG
  /** Optional tier table from the creator's profile. When present, overrides
   *  recast_commission_pct using cliff semantics (see effectivePctFromTiers). */
  tiers?: CommissionTier[] | null;
}

export function calcTelePeriod(input: TelePeriodInput): TelePeriodCalc {
  const gross = round2(Math.max(0, input.gross_revenue));
  const net =
    input.net_revenue != null
      ? round2(Math.max(0, input.net_revenue))
      : round2(gross * TELEGRAM_PLATFORM_NET_RATIO);

  const mg = input.min_guarantee ?? 0;
  const mgQualifier = mg * TELEGRAM_MG_QUALIFIER_RATIO;
  const qualified = mg > 0 && net >= mgQualifier;
  const topUp = qualified ? round2(Math.max(0, mg - net)) : 0;

  const baseForCommission =
    input.commission_basis === "gross" ? gross : round2(net + topUp);
  // Tiers, if present, are evaluated against the GROSS revenue — Gustavo's
  // monthly threshold is "how much did the creator make this month", not
  // "how much was Recast's base after splits". Cliff semantics per spec.
  const tieredPct = effectivePctFromTiers(gross, input.tiers);
  const effectivePct = tieredPct ?? input.recast_commission_pct;
  const recastCommission = round2(baseForCommission * (effectivePct / 100));

  const creatorTakeHome = round2(net + topUp - recastCommission);

  return {
    gross_revenue: gross,
    net_revenue: net,
    qualified_for_mg: qualified,
    mg_top_up: topUp,
    recast_commission: recastCommission,
    creator_take_home: creatorTakeHome,
  };
}

// ─────────────────────────────────────────────────────────────────────

export interface OFPeriodCalc {
  gross_revenue: number;
  net_revenue: number;
  recast_commission: number;
  girls_share: number;            // creator's share after Recast cut
}

export interface OFPeriodInput {
  gross_revenue: number;
  net_revenue?: number;           // optional override; defaults equal to gross
  recast_pct: number;             // e.g. 35 for 35% (used when tiers is null/empty)
  basis: "gross" | "net";
  /** Optional tier table from the creator's profile. Cliff semantics per K-2. */
  tiers?: CommissionTier[] | null;
}

export function calcOFPeriod(input: OFPeriodInput): OFPeriodCalc {
  const gross = round2(Math.max(0, input.gross_revenue));
  const net =
    input.net_revenue != null
      ? round2(Math.max(0, input.net_revenue))
      : gross;

  const baseForCommission = input.basis === "gross" ? gross : net;
  const tieredPct = effectivePctFromTiers(gross, input.tiers);
  const effectivePct = tieredPct ?? input.recast_pct;
  const recastCommission = round2(baseForCommission * (effectivePct / 100));
  const girlsShare = round2(net - recastCommission);

  return {
    gross_revenue: gross,
    net_revenue: net,
    recast_commission: recastCommission,
    girls_share: girlsShare,
  };
}

// ─────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
