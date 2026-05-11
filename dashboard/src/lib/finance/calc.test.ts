import { describe, expect, it } from "vitest";
import {
  calcOFPeriod,
  calcTelePeriod,
  commissionDollarsFromTiers,
  effectivePctFromTiers,
} from "./calc";

describe("calcTelePeriod — Telegram MG logic", () => {
  it("default 50% net, 20% commission on net, no MG", () => {
    const r = calcTelePeriod({
      gross_revenue: 10_000,
      recast_commission_pct: 20,
      commission_basis: "net",
    });
    expect(r.gross_revenue).toBe(10_000);
    expect(r.net_revenue).toBe(5_000);
    expect(r.qualified_for_mg).toBe(false);
    expect(r.mg_top_up).toBe(0);
    expect(r.recast_commission).toBe(1_000); // 20% of 5000
    expect(r.creator_take_home).toBe(4_000);
  });

  it("commission on gross, not net", () => {
    const r = calcTelePeriod({
      gross_revenue: 10_000,
      recast_commission_pct: 20,
      commission_basis: "gross",
    });
    expect(r.recast_commission).toBe(2_000); // 20% of 10000
    expect(r.creator_take_home).toBe(3_000); // net 5000 − commission 2000 = 3000
  });

  it("disqualifies for MG when net < 50% of MG", () => {
    // MG = 7000 → qualifier threshold = 3500
    // net = 0.5 × 6000 = 3000  → below threshold, no top-up
    const r = calcTelePeriod({
      gross_revenue: 6_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 7_000,
    });
    expect(r.net_revenue).toBe(3_000);
    expect(r.qualified_for_mg).toBe(false);
    expect(r.mg_top_up).toBe(0);
    expect(r.recast_commission).toBe(600); // 20% of 3000
  });

  it("qualifies for MG and tops creator up to MG", () => {
    // MG = 7000 → qualifier threshold = 3500
    // net = 0.5 × 8000 = 4000  → above threshold, qualifies
    // top-up = 7000 − 4000 = 3000
    // commission base = net + top-up = 7000
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 7_000,
    });
    expect(r.net_revenue).toBe(4_000);
    expect(r.qualified_for_mg).toBe(true);
    expect(r.mg_top_up).toBe(3_000);
    expect(r.recast_commission).toBe(1_400); // 20% of (4000 + 3000)
    expect(r.creator_take_home).toBe(5_600); // 7000 − 1400
  });

  it("creator already exceeds MG → no top-up, normal commission", () => {
    // MG = 5000 → qualifier threshold = 2500
    // net = 0.5 × 12000 = 6000 → exceeds MG, no top-up
    const r = calcTelePeriod({
      gross_revenue: 12_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 5_000,
    });
    expect(r.qualified_for_mg).toBe(true);
    expect(r.mg_top_up).toBe(0);
    expect(r.recast_commission).toBe(1_200);
    expect(r.creator_take_home).toBe(4_800);
  });

  it("commission_basis=gross with MG: commission still on gross even when topped up", () => {
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 20,
      commission_basis: "gross",
      min_guarantee: 7_000,
    });
    expect(r.mg_top_up).toBe(3_000);
    expect(r.recast_commission).toBe(1_600); // 20% of gross 8000
  });

  it("zero gross → all zero", () => {
    const r = calcTelePeriod({
      gross_revenue: 0,
      recast_commission_pct: 20,
      commission_basis: "net",
    });
    expect(r.net_revenue).toBe(0);
    expect(r.recast_commission).toBe(0);
    expect(r.creator_take_home).toBe(0);
  });

  it("net_revenue override is respected (rare manual case)", () => {
    const r = calcTelePeriod({
      gross_revenue: 10_000,
      net_revenue: 6_000, // override (not standard 50%)
      recast_commission_pct: 20,
      commission_basis: "net",
    });
    expect(r.net_revenue).toBe(6_000);
    expect(r.recast_commission).toBe(1_200);
  });

  it("worked example from Gustavo's spec", () => {
    // "10k gross rev, net rev = 50% off of gross, recast commission 20%,
    //  min guarantee would need to 7k"
    const r = calcTelePeriod({
      gross_revenue: 10_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 7_000,
    });
    expect(r.net_revenue).toBe(5_000);
    expect(r.qualified_for_mg).toBe(true); // net 5000 >= 0.5 × 7000 = 3500
    expect(r.mg_top_up).toBe(2_000); // 7000 − 5000
    expect(r.recast_commission).toBe(1_400); // 20% of (5000 + 2000)
  });
});

describe("calcOFPeriod — OnlyFans split", () => {
  it("50% on net (Charlotte's pages)", () => {
    const r = calcOFPeriod({
      gross_revenue: 10_000,
      net_revenue: 8_000,    // OF takes ~20% platform fee
      recast_pct: 50,
      basis: "net",
    });
    expect(r.recast_commission).toBe(4_000);
    expect(r.girls_share).toBe(4_000);
  });

  it("35% on net (Harriet)", () => {
    const r = calcOFPeriod({
      gross_revenue: 5_000,
      net_revenue: 4_000,
      recast_pct: 35,
      basis: "net",
    });
    expect(r.recast_commission).toBe(1_400);
    expect(r.girls_share).toBe(2_600);
  });

  it("commission on gross", () => {
    const r = calcOFPeriod({
      gross_revenue: 10_000,
      net_revenue: 8_000,
      recast_pct: 50,
      basis: "gross",
    });
    expect(r.recast_commission).toBe(5_000);
    expect(r.girls_share).toBe(3_000); // net 8000 - commission 5000
  });

  it("net defaults to gross when not provided", () => {
    const r = calcOFPeriod({
      gross_revenue: 1_000,
      recast_pct: 30,
      basis: "net",
    });
    expect(r.net_revenue).toBe(1_000);
    expect(r.recast_commission).toBe(300);
    expect(r.girls_share).toBe(700);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Round 3 (Gustavo decision B): tier semantics PROGRESSIVE
//
// The legacy K-2 tests asserted CLIFF behaviour (highest crossed tier
// applies to the whole month). Those expectations are obsolete — see
// the calc.ts header for the new spec. The data shape is unchanged;
// only the math reading it flipped.
// ─────────────────────────────────────────────────────────────────────

describe("commissionDollarsFromTiers — progressive (income-bracket) semantics", () => {
  const tiers = [
    { threshold: 0, pct: 30 },
    { threshold: 10_000, pct: 25 },
    { threshold: 50_000, pct: 20 },
  ];

  it("returns 0 when tiers empty or gross zero", () => {
    expect(commissionDollarsFromTiers(5_000, [])).toBe(0);
    expect(commissionDollarsFromTiers(5_000, null)).toBe(0);
    expect(commissionDollarsFromTiers(5_000, undefined)).toBe(0);
    expect(commissionDollarsFromTiers(0, tiers)).toBe(0);
  });

  it("whole gross sits inside the first tier", () => {
    // $5,000 entirely inside 0–10K @ 30% → 1500
    expect(commissionDollarsFromTiers(5_000, tiers)).toBe(1_500);
  });

  it("gross spans two tiers — each slice billed independently", () => {
    // $15,000 → first 10K @ 30% (3000) + next 5K @ 25% (1250) = 4250
    expect(commissionDollarsFromTiers(15_000, tiers)).toBe(4_250);
  });

  it("gross spans all three tiers", () => {
    // $60,000 → 10K @ 30% (3000) + 40K @ 25% (10000) + 10K @ 20% (2000) = 15000
    expect(commissionDollarsFromTiers(60_000, tiers)).toBe(15_000);
  });

  it("handles unsorted tier input", () => {
    const unsorted = [
      { threshold: 50_000, pct: 20 },
      { threshold: 0, pct: 30 },
      { threshold: 10_000, pct: 25 },
    ];
    expect(commissionDollarsFromTiers(15_000, unsorted)).toBe(4_250);
  });

  it("exact threshold boundary — slice width is 0 at that tier edge", () => {
    // gross = 10000 exactly → all in tier 0 (10K @ 30% = 3000), the
    // 10K boundary contributes 0 width.
    expect(commissionDollarsFromTiers(10_000, tiers)).toBe(3_000);
  });
});

describe("effectivePctFromTiers — derived from progressive math", () => {
  const tiers = [
    { threshold: 0, pct: 30 },
    { threshold: 10_000, pct: 25 },
    { threshold: 50_000, pct: 20 },
  ];

  it("returns null when tiers empty", () => {
    expect(effectivePctFromTiers(5_000, [])).toBeNull();
    expect(effectivePctFromTiers(5_000, null)).toBeNull();
    expect(effectivePctFromTiers(5_000, undefined)).toBeNull();
  });

  it("zero gross — returns first-tier pct (avoids divide-by-zero)", () => {
    expect(effectivePctFromTiers(0, tiers)).toBe(30);
  });

  it("blended rate inside a single tier equals that tier's pct", () => {
    expect(effectivePctFromTiers(5_000, tiers)).toBeCloseTo(30, 4);
  });

  it("blended rate across two tiers is between the two pcts", () => {
    // $15,000: 10K @ 30% + 5K @ 25% = 4250 → 4250/15000 ≈ 28.33%
    expect(effectivePctFromTiers(15_000, tiers)).toBeCloseTo(28.333, 2);
  });

  it("blended rate across all three tiers", () => {
    // $60,000: commission 15000 → 25% effective
    expect(effectivePctFromTiers(60_000, tiers)).toBeCloseTo(25, 4);
  });
});

describe("calcTelePeriod with progressive tiers", () => {
  const tiers = [
    { threshold: 0, pct: 30 },
    { threshold: 10_000, pct: 20 },
  ];

  it("under threshold: full 30%", () => {
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 50, // ignored when tiers present
      commission_basis: "net",
      tiers,
    });
    // gross 8000 entirely inside tier 0 → effective 30%
    // net = 4000, commission = 4000 × 30% = 1200
    expect(r.recast_commission).toBe(1_200);
  });

  it("crosses threshold: blended rate applies to the commission base (net)", () => {
    const r = calcTelePeriod({
      gross_revenue: 12_000,
      recast_commission_pct: 50, // ignored
      commission_basis: "net",
      tiers,
    });
    // gross 12000: 10K @ 30% + 2K @ 20% = 3400 → effective ≈ 28.33%
    // net = 6000, commission = 6000 × 28.33% ≈ 1700
    expect(r.recast_commission).toBeCloseTo(1_700, 1);
  });

  it("falls back to flat pct when tiers omitted", () => {
    const r = calcTelePeriod({
      gross_revenue: 12_000,
      recast_commission_pct: 25,
      commission_basis: "net",
    });
    // net = 6000, commission = 6000 × 25% = 1500
    expect(r.recast_commission).toBe(1_500);
  });

  it("tiers + MG: effective pct applies to (net + top-up)", () => {
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 50, // ignored
      commission_basis: "net",
      min_guarantee: 5_000,
      tiers,
    });
    // gross 8000 entirely inside tier 0 → effective 30%
    // net 4000 ≥ 50% of 5000 → qualified, top-up = 1000, base = 5000
    // commission = 5000 × 30% = 1500
    expect(r.qualified_for_mg).toBe(true);
    expect(r.mg_top_up).toBe(1_000);
    expect(r.recast_commission).toBe(1_500);
  });
});

describe("calcOFPeriod with progressive tiers", () => {
  const tiers = [
    { threshold: 0, pct: 50 },
    { threshold: 5_000, pct: 40 },
  ];

  it("under threshold: 50% on full gross", () => {
    const r = calcOFPeriod({
      gross_revenue: 3_000,
      recast_pct: 99, // ignored
      basis: "gross",
      tiers,
    });
    // entirely inside tier 0 → 1500 commission
    expect(r.recast_commission).toBe(1_500);
    expect(r.girls_share).toBe(1_500);
  });

  it("at/above threshold: blended rate, not cliff", () => {
    const r = calcOFPeriod({
      gross_revenue: 10_000,
      recast_pct: 99,
      basis: "gross",
      tiers,
    });
    // 5K @ 50% (2500) + 5K @ 40% (2000) = 4500 → effective 45%
    // commission = 10000 × 45% = 4500
    expect(r.recast_commission).toBe(4_500);
    expect(r.girls_share).toBe(5_500);
  });
});
