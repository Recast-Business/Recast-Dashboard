import { describe, expect, it } from "vitest";
import {
  calcOFPeriod,
  calcTelePeriod,
  commissionDollarsFromTiers,
  effectivePctFromTiers,
  tiersFromProfile,
  type CommissionTier,
} from "./calc";

// ─────────────────────────────────────────────────────────────────────
// Tier shape used throughout — Round 3 canonical (threshold = "tier
// ENDS at", null on the last tier = "and above").
// ─────────────────────────────────────────────────────────────────────

const TIERS_3LEVEL: CommissionTier[] = [
  { threshold: 10_000, pct: 30 }, // $0–10K
  { threshold: 50_000, pct: 25 }, // $10K–50K
  { threshold: null, pct: 20 },   // $50K+
];

const TIERS_2LEVEL: CommissionTier[] = [
  { threshold: 10_000, pct: 30 }, // $0–10K
  { threshold: null, pct: 20 },   // $10K+
];

// ─────────────────────────────────────────────────────────────────────
// Existing Telegram MG logic — unchanged. Kept exhaustive because the
// MG/top-up math is the trickiest part of the engine and easy to
// regress.
// ─────────────────────────────────────────────────────────────────────

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
    expect(r.recast_commission).toBe(1_000);
    expect(r.creator_take_home).toBe(4_000);
  });

  it("commission on gross, not net", () => {
    const r = calcTelePeriod({
      gross_revenue: 10_000,
      recast_commission_pct: 20,
      commission_basis: "gross",
    });
    expect(r.recast_commission).toBe(2_000);
    expect(r.creator_take_home).toBe(3_000);
  });

  it("disqualifies for MG when net < 50% of MG", () => {
    const r = calcTelePeriod({
      gross_revenue: 6_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 7_000,
    });
    expect(r.net_revenue).toBe(3_000);
    expect(r.qualified_for_mg).toBe(false);
    expect(r.mg_top_up).toBe(0);
    expect(r.recast_commission).toBe(600);
  });

  it("qualifies for MG and tops creator up to MG", () => {
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 7_000,
    });
    expect(r.net_revenue).toBe(4_000);
    expect(r.qualified_for_mg).toBe(true);
    expect(r.mg_top_up).toBe(3_000);
    expect(r.recast_commission).toBe(1_400);
    expect(r.creator_take_home).toBe(5_600);
  });

  it("creator already exceeds MG → no top-up, normal commission", () => {
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
    expect(r.recast_commission).toBe(1_600);
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
      net_revenue: 6_000,
      recast_commission_pct: 20,
      commission_basis: "net",
    });
    expect(r.net_revenue).toBe(6_000);
    expect(r.recast_commission).toBe(1_200);
  });

  it("worked example from Gustavo's spec", () => {
    const r = calcTelePeriod({
      gross_revenue: 10_000,
      recast_commission_pct: 20,
      commission_basis: "net",
      min_guarantee: 7_000,
    });
    expect(r.net_revenue).toBe(5_000);
    expect(r.qualified_for_mg).toBe(true);
    expect(r.mg_top_up).toBe(2_000);
    expect(r.recast_commission).toBe(1_400);
  });
});

describe("calcOFPeriod — OnlyFans split", () => {
  it("50% on net (Charlotte's pages)", () => {
    const r = calcOFPeriod({
      gross_revenue: 10_000,
      net_revenue: 8_000,
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
    expect(r.girls_share).toBe(3_000);
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
// Round 3: progressive (default) tier math
// ─────────────────────────────────────────────────────────────────────

describe("commissionDollarsFromTiers — progressive (default)", () => {
  it("returns 0 when tiers empty or gross zero", () => {
    expect(commissionDollarsFromTiers(5_000, [])).toBe(0);
    expect(commissionDollarsFromTiers(5_000, null)).toBe(0);
    expect(commissionDollarsFromTiers(0, TIERS_3LEVEL)).toBe(0);
  });

  it("whole gross sits inside the first tier", () => {
    // $5K entirely inside $0–10K @ 30% → 1500
    expect(commissionDollarsFromTiers(5_000, TIERS_3LEVEL)).toBe(1_500);
  });

  it("gross spans two tiers — each slice billed independently", () => {
    // $15K → 10K @ 30% (3000) + 5K @ 25% (1250) = 4250
    expect(commissionDollarsFromTiers(15_000, TIERS_3LEVEL)).toBe(4_250);
  });

  it("gross spans all three tiers", () => {
    // $60K → 10K @ 30% (3000) + 40K @ 25% (10000) + 10K @ 20% (2000) = 15000
    expect(commissionDollarsFromTiers(60_000, TIERS_3LEVEL)).toBe(15_000);
  });

  it("handles unsorted input + null-threshold sorts last", () => {
    const unsorted: CommissionTier[] = [
      { threshold: null, pct: 20 },
      { threshold: 10_000, pct: 30 },
      { threshold: 50_000, pct: 25 },
    ];
    expect(commissionDollarsFromTiers(15_000, unsorted)).toBe(4_250);
  });

  it("single null-threshold tier = flat rate covering everything", () => {
    expect(
      commissionDollarsFromTiers(12_345, [{ threshold: null, pct: 30 }]),
    ).toBe(3_703.5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Round 3 Q1: cliff (legacy grandfathered) tier math
// ─────────────────────────────────────────────────────────────────────

describe("commissionDollarsFromTiers — cliff", () => {
  it("gross inside tier 0 → whole × tier 0 pct", () => {
    expect(commissionDollarsFromTiers(5_000, TIERS_3LEVEL, "cliff")).toBe(1_500);
  });

  it("gross spans into tier 1 → whole × tier 1 pct (not blended)", () => {
    // $15K * 25% = 3750 (vs progressive 4250)
    expect(commissionDollarsFromTiers(15_000, TIERS_3LEVEL, "cliff")).toBe(3_750);
  });

  it("gross in terminal (null-threshold) tier → whole × tier pct", () => {
    // $60K * 20% = 12000 (vs progressive 15000)
    expect(commissionDollarsFromTiers(60_000, TIERS_3LEVEL, "cliff")).toBe(12_000);
  });

  it("at exact tier boundary → uses the ENDING tier (inclusive end)", () => {
    // $10K is exactly the end of tier 0 → tier 0 still applies.
    // 10000 * 30% = 3000
    expect(commissionDollarsFromTiers(10_000, TIERS_3LEVEL, "cliff")).toBe(3_000);
  });

  it("worked example: 2-tier $15K cliff vs progressive (Gustavo's compare)", () => {
    // 2-tier table: $0–10K @ 30%, $10K+ @ 20%
    // Cliff @ $15K: tier-1 bucket → 15000 × 20% = 3000
    // Progressive @ $15K: 10K × 30% + 5K × 20% = 4000
    expect(commissionDollarsFromTiers(15_000, TIERS_2LEVEL, "cliff")).toBe(3_000);
    expect(commissionDollarsFromTiers(15_000, TIERS_2LEVEL, "progressive")).toBe(4_000);

    // 3-tier table: $0–10K @ 30%, $10K–50K @ 25%, $50K+ @ 20%
    // Cliff @ $15K: tier-1 bucket → 15000 × 25% = 3750
    // Progressive @ $15K: 10K × 30% + 5K × 25% = 4250
    expect(commissionDollarsFromTiers(15_000, TIERS_3LEVEL, "cliff")).toBe(3_750);
    expect(commissionDollarsFromTiers(15_000, TIERS_3LEVEL, "progressive")).toBe(4_250);
  });
});

describe("effectivePctFromTiers", () => {
  it("returns null when tiers empty", () => {
    expect(effectivePctFromTiers(5_000, [])).toBeNull();
    expect(effectivePctFromTiers(5_000, null)).toBeNull();
  });

  it("zero gross — first-tier pct (avoids divide-by-zero)", () => {
    expect(effectivePctFromTiers(0, TIERS_3LEVEL)).toBe(30);
  });

  it("progressive: blended rate", () => {
    expect(effectivePctFromTiers(15_000, TIERS_3LEVEL)).toBeCloseTo(28.333, 2);
    expect(effectivePctFromTiers(60_000, TIERS_3LEVEL)).toBeCloseTo(25, 4);
  });

  it("cliff: tier's flat pct (single-tier rate per range)", () => {
    expect(effectivePctFromTiers(5_000, TIERS_3LEVEL, "cliff")).toBeCloseTo(30, 4);
    expect(effectivePctFromTiers(15_000, TIERS_3LEVEL, "cliff")).toBeCloseTo(25, 4);
    expect(effectivePctFromTiers(60_000, TIERS_3LEVEL, "cliff")).toBeCloseTo(20, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Round 3: calcOF / calcTele honour the commissionMode flag
// ─────────────────────────────────────────────────────────────────────

describe("calcTelePeriod with progressive tiers (default)", () => {
  it("under threshold: 30% blend", () => {
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 50,
      commission_basis: "net",
      tiers: TIERS_2LEVEL,
    });
    // gross 8K entirely inside tier 0 → effective 30%
    // net 4K × 30% = 1200
    expect(r.recast_commission).toBe(1_200);
  });

  it("crosses threshold: progressive blend applied to net base", () => {
    const r = calcTelePeriod({
      gross_revenue: 12_000,
      recast_commission_pct: 50,
      commission_basis: "net",
      tiers: TIERS_2LEVEL,
    });
    // gross 12K: 10K @ 30% + 2K @ 20% = 3400 → effective ≈ 28.33%
    // net 6K × 28.33% ≈ 1700
    expect(r.recast_commission).toBeCloseTo(1_700, 1);
  });
});

describe("calcTelePeriod with cliff tiers", () => {
  it("crosses threshold: tier's flat pct applied to net base", () => {
    const r = calcTelePeriod({
      gross_revenue: 12_000,
      recast_commission_pct: 50,
      commission_basis: "net",
      tiers: TIERS_2LEVEL,
      commissionMode: "cliff",
    });
    // gross 12K is in tier 1 (10K+) → 20% flat
    // net 6K × 20% = 1200
    expect(r.recast_commission).toBe(1_200);
  });

  it("tiers + MG: cliff pct applies to (net + top-up)", () => {
    const r = calcTelePeriod({
      gross_revenue: 8_000,
      recast_commission_pct: 50,
      commission_basis: "net",
      min_guarantee: 5_000,
      tiers: TIERS_2LEVEL,
      commissionMode: "cliff",
    });
    // gross 8K in tier 0 → 30%
    // net 4K qualifies (≥ 2.5K), top-up = 1K, base = 5K
    // commission = 5K × 30% = 1500
    expect(r.qualified_for_mg).toBe(true);
    expect(r.mg_top_up).toBe(1_000);
    expect(r.recast_commission).toBe(1_500);
  });
});

describe("calcOFPeriod with mode flag", () => {
  const tiers: CommissionTier[] = [
    { threshold: 5_000, pct: 50 },   // $0–5K
    { threshold: null, pct: 40 },    // $5K+
  ];

  it("progressive (default) at $10K = 4500", () => {
    const r = calcOFPeriod({
      gross_revenue: 10_000,
      recast_pct: 99,
      basis: "gross",
      tiers,
    });
    // 5K × 50% + 5K × 40% = 4500
    expect(r.recast_commission).toBe(4_500);
  });

  it("cliff at $10K = 4000 (whole × terminal 40%)", () => {
    const r = calcOFPeriod({
      gross_revenue: 10_000,
      recast_pct: 99,
      basis: "gross",
      tiers,
      commissionMode: "cliff",
    });
    expect(r.recast_commission).toBe(4_000);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Round 3 Q7: tiersFromProfile — reads new canonical column first,
// translates legacy shape on the fly otherwise.
// ─────────────────────────────────────────────────────────────────────

describe("tiersFromProfile — canonical column wins", () => {
  it("reads commission_tiers when present and ignores legacy column", () => {
    const creator = {
      commission_tiers: {
        onlyfans: [
          { threshold: 5_000, pct: 50 },
          { threshold: null, pct: 40 },
        ],
      },
      commission_pct_by_platform: {
        onlyfans: 999, // would be a totally different read; ignored
      },
    };
    const tiers = tiersFromProfile(creator, "onlyfans");
    expect(tiers).toEqual([
      { threshold: 5_000, pct: 50 },
      { threshold: null, pct: 40 },
    ]);
  });

  it("returns null when neither column has data for the platform", () => {
    expect(tiersFromProfile({}, "onlyfans")).toBeNull();
    expect(tiersFromProfile(null, "onlyfans")).toBeNull();
    expect(tiersFromProfile(undefined, "telegram")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// R5 Sweep 3c — per-page lookup. Migration 0043 wraps platform tiers
// under a page_name key so creators can have different commission
// structures per OF page. Callers pass the page name; pickPage()
// falls back to "main" then alphabetical-first when the deal's page
// has no row of its own.
// ─────────────────────────────────────────────────────────────────────

describe("tiersFromProfile — per-page nested shape", () => {
  it("returns the requested page's tiers", () => {
    const creator = {
      commission_tiers: {
        onlyfans: {
          main: [{ threshold: null, pct: 40 }],
          vip: [{ threshold: null, pct: 30 }],
        },
      },
    };
    expect(tiersFromProfile(creator, "onlyfans", "vip")).toEqual([
      { threshold: null, pct: 30 },
    ]);
    expect(tiersFromProfile(creator, "onlyfans", "main")).toEqual([
      { threshold: null, pct: 40 },
    ]);
  });

  it("falls back to 'main' when no page is specified", () => {
    const creator = {
      commission_tiers: {
        onlyfans: {
          main: [{ threshold: null, pct: 40 }],
          vip: [{ threshold: null, pct: 30 }],
        },
      },
    };
    expect(tiersFromProfile(creator, "onlyfans")).toEqual([
      { threshold: null, pct: 40 },
    ]);
  });

  it("falls back to 'main' when the requested page does not exist", () => {
    // OF deal might be on a page that hasn't had its commission row
    // configured yet — fall back to "main" rather than returning null.
    const creator = {
      commission_tiers: {
        onlyfans: {
          main: [{ threshold: null, pct: 40 }],
        },
      },
    };
    expect(tiersFromProfile(creator, "onlyfans", "unconfigured-page")).toEqual([
      { threshold: null, pct: 40 },
    ]);
  });

  it("falls back to alphabetical-first page when no 'main' page exists", () => {
    const creator = {
      commission_tiers: {
        onlyfans: {
          zeta: [{ threshold: null, pct: 50 }],
          alpha: [{ threshold: null, pct: 30 }],
        },
      },
    };
    expect(tiersFromProfile(creator, "onlyfans")).toEqual([
      { threshold: null, pct: 30 },
    ]);
  });

  it("still reads legacy flat shape when nested shape is absent", () => {
    // Pre-0043 creators have flat platform → tiers[]. pickPage() should
    // recognise this and return it as-is regardless of the page arg.
    const creator = {
      commission_tiers: {
        onlyfans: [{ threshold: null, pct: 35 }],
      },
    };
    expect(tiersFromProfile(creator, "onlyfans", "main")).toEqual([
      { threshold: null, pct: 35 },
    ]);
    expect(tiersFromProfile(creator, "onlyfans", "vip")).toEqual([
      { threshold: null, pct: 35 },
    ]);
  });
});

describe("tiersFromProfile — legacy fallback", () => {
  it("translates a flat number to a single null-threshold tier", () => {
    const creator = {
      commission_tiers: {},
      commission_pct_by_platform: { onlyfans: 35 },
    };
    expect(tiersFromProfile(creator, "onlyfans")).toEqual([
      { threshold: null, pct: 35 },
    ]);
  });

  it("translates legacy starts-at array → canonical ends-at array", () => {
    const creator = {
      commission_tiers: {},
      commission_pct_by_platform: {
        telegram: [
          { threshold: 0, pct: 30 },
          { threshold: 10_000, pct: 25 },
          { threshold: 50_000, pct: 20 },
        ],
      },
    };
    expect(tiersFromProfile(creator, "telegram")).toEqual([
      { threshold: 10_000, pct: 30 },
      { threshold: 50_000, pct: 25 },
      { threshold: null, pct: 20 },
    ]);
  });

  it("translated legacy data + progressive math yields same dollars as direct call", () => {
    // Legacy data via fallback path:
    const viaLegacy = tiersFromProfile(
      {
        commission_tiers: {},
        commission_pct_by_platform: {
          onlyfans: [
            { threshold: 0, pct: 30 },
            { threshold: 10_000, pct: 20 },
          ],
        },
      },
      "onlyfans",
    );
    // Same data already in canonical shape:
    const direct = TIERS_2LEVEL;
    // Both should produce identical commission dollars.
    expect(commissionDollarsFromTiers(15_000, viaLegacy)).toBe(
      commissionDollarsFromTiers(15_000, direct),
    );
    expect(commissionDollarsFromTiers(15_000, viaLegacy, "cliff")).toBe(
      commissionDollarsFromTiers(15_000, direct, "cliff"),
    );
  });

  it("null value on a platform → null result", () => {
    expect(
      tiersFromProfile(
        { commission_pct_by_platform: { telegram: null } },
        "telegram",
      ),
    ).toBeNull();
  });

  it("empty legacy array → null", () => {
    expect(
      tiersFromProfile(
        { commission_pct_by_platform: { onlyfans: [] } },
        "onlyfans",
      ),
    ).toBeNull();
  });
});
