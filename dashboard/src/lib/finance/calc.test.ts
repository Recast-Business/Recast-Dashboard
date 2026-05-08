import { describe, expect, it } from "vitest";
import { calcOFPeriod, calcTelePeriod } from "./calc";

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
