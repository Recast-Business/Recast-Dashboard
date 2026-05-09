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
 * Phase K-2: tiered commissions with cliff semantics.
 *   • Tiers are an array of { threshold, pct } sorted by threshold.
 *   • For a given month's gross G, find the highest-threshold tier where
 *     threshold <= G — its pct applies to the WHOLE month (cliff, not
 *     marginal). Confirmed by Gustavo.
 *   • If gross < lowest threshold (rare — usually threshold=0 covers it),
 *     fall back to the lowest tier's pct.
 *   • Backward compat: when tiers is null/undefined/empty, the calc uses
 *     the deal's flat pct as before.
 */

export interface CommissionTier {
  /** Monthly gross >= this threshold → use this pct (cliff). */
  threshold: number;
  /** Recast's cut, 0–100. */
  pct: number;
}

/** Resolve which tier applies for a given monthly gross under cliff
 *  semantics. Returns null if no tiers provided. */
export function effectivePctFromTiers(
  gross: number,
  tiers: CommissionTier[] | null | undefined,
): number | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  let chosen = sorted[0].pct;
  for (const t of sorted) {
    if (gross >= t.threshold) chosen = t.pct;
    else break;
  }
  return chosen;
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
