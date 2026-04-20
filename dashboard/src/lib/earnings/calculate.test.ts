import { describe, expect, it } from "vitest";
import {
  applyManualOverrides,
  computeEarnings,
  hasManualOverrides,
} from "./calculate";
import type { DealComponent } from "@/types/deal";

const COMMISSION = 20;

describe("computeEarnings", () => {
  it("flat fee", () => {
    const r = computeEarnings([{ type: "flat_fee", amount: 1000 }], COMMISSION);
    expect(r.gross).toBe(1000);
    expect(r.commission).toBe(200);
    expect(r.net).toBe(800);
  });

  it("per post", () => {
    const r = computeEarnings(
      [{ type: "per_post", rate: 250, posts: 4 }],
      COMMISSION,
    );
    expect(r.gross).toBe(1000);
  });

  it("per stream", () => {
    const r = computeEarnings(
      [{ type: "per_stream", rate: 500, streams: 3 }],
      COMMISSION,
    );
    expect(r.gross).toBe(1500);
  });

  it("rev share without MG", () => {
    const r = computeEarnings(
      [{ type: "rev_share", percent: 25, revenue: 4000 }],
      COMMISSION,
    );
    expect(r.gross).toBe(1000);
  });

  it("rev share with MG applied", () => {
    const r = computeEarnings(
      [{ type: "rev_share", percent: 10, revenue: 4000, minGuarantee: 500 }],
      COMMISSION,
    );
    expect(r.gross).toBe(500);
    expect(r.breakdown[0].detail).toMatch(/MG applied/);
  });

  it("rev share MG not needed", () => {
    const r = computeEarnings(
      [{ type: "rev_share", percent: 25, revenue: 4000, minGuarantee: 500 }],
      COMMISSION,
    );
    expect(r.gross).toBe(1000);
  });

  it("tiered bonus — highest tier (default)", () => {
    const c: DealComponent = {
      type: "tiered_bonus",
      tiers: [
        { threshold: 100, bonus: 50 },
        { threshold: 500, bonus: 200 },
        { threshold: 1000, bonus: 500 },
      ],
      metric: 750,
    };
    const r = computeEarnings([c], COMMISSION);
    expect(r.gross).toBe(200);
  });

  it("tiered bonus — cumulative mode", () => {
    const c: DealComponent = {
      type: "tiered_bonus",
      mode: "cumulative",
      tiers: [
        { threshold: 100, bonus: 50 },
        { threshold: 500, bonus: 200 },
        { threshold: 1000, bonus: 500 },
      ],
      metric: 750,
    };
    const r = computeEarnings([c], COMMISSION);
    expect(r.gross).toBe(250);
  });

  it("tiered bonus — none reached", () => {
    const r = computeEarnings(
      [
        {
          type: "tiered_bonus",
          tiers: [{ threshold: 1000, bonus: 500 }],
          metric: 50,
        },
      ],
      COMMISSION,
    );
    expect(r.gross).toBe(0);
  });

  it("daily log", () => {
    const r = computeEarnings(
      [{ type: "daily_log", ratePerDay: 100, days: 14 }],
      COMMISSION,
    );
    expect(r.gross).toBe(1400);
  });

  it("weekly cap — under cap", () => {
    const r = computeEarnings(
      [
        {
          type: "weekly_cap",
          ratePerHour: 25,
          hours: 20,
          weeklyCap: 1000,
        },
      ],
      COMMISSION,
    );
    expect(r.gross).toBe(500);
  });

  it("weekly cap — capped", () => {
    const r = computeEarnings(
      [
        {
          type: "weekly_cap",
          ratePerHour: 25,
          hours: 60,
          weeklyCap: 1000,
        },
      ],
      COMMISSION,
    );
    expect(r.gross).toBe(1000);
    expect(r.breakdown[0].detail).toMatch(/capped/);
  });

  it("weekly cap — with prior rollover", () => {
    const r = computeEarnings(
      [
        {
          type: "weekly_cap",
          ratePerHour: 25,
          hours: 10,
          weeklyCap: 1000,
          priorRollover: 300,
        },
      ],
      COMMISSION,
    );
    expect(r.gross).toBe(550);
  });

  it("cpm", () => {
    const r = computeEarnings(
      [{ type: "cpm", rate: 5, impressions: 100_000 }],
      COMMISSION,
    );
    expect(r.gross).toBe(500);
  });

  it("stacks multiple components", () => {
    const r = computeEarnings(
      [
        { type: "flat_fee", amount: 1000 },
        { type: "per_stream", rate: 500, streams: 3 },
        {
          type: "tiered_bonus",
          tiers: [{ threshold: 1000, bonus: 250 }],
          metric: 1500,
        },
      ],
      COMMISSION,
    );
    expect(r.gross).toBe(2750);
    expect(r.commission).toBe(550);
    expect(r.net).toBe(2200);
    expect(r.breakdown).toHaveLength(3);
  });

  it("empty components → zero", () => {
    const r = computeEarnings([], COMMISSION);
    expect(r.gross).toBe(0);
    expect(r.commission).toBe(0);
    expect(r.net).toBe(0);
  });

  it("clamps negative commission rate to 0", () => {
    const r = computeEarnings([{ type: "flat_fee", amount: 1000 }], -10);
    expect(r.commission).toBe(0);
    expect(r.net).toBe(1000);
  });

  it("clamps commission >100 to 100", () => {
    const r = computeEarnings([{ type: "flat_fee", amount: 1000 }], 200);
    expect(r.commission).toBe(1000);
    expect(r.net).toBe(0);
  });

  it("ignores negative inputs (treats as 0)", () => {
    const r = computeEarnings(
      [{ type: "per_post", rate: -50, posts: 3 }],
      COMMISSION,
    );
    expect(r.gross).toBe(0);
  });
});

describe("applyManualOverrides", () => {
  const base = computeEarnings([{ type: "flat_fee", amount: 1000 }], 20);

  it("returns base when no overrides", () => {
    expect(applyManualOverrides(base, null, 20)).toEqual(base);
    expect(applyManualOverrides(base, {}, 20)).toEqual(base);
  });

  it("overrides gross and recalculates commission + net at commission rate", () => {
    const r = applyManualOverrides(base, { override_gross: 1200 }, 20);
    expect(r.gross).toBe(1200);
    expect(r.commission).toBe(240);
    expect(r.net).toBe(960);
  });

  it("overrides commission only, keeping base gross", () => {
    const r = applyManualOverrides(base, { override_commission: 350 }, 20);
    expect(r.gross).toBe(1000);
    expect(r.commission).toBe(350);
    expect(r.net).toBe(650);
  });

  it("overrides both independently", () => {
    const r = applyManualOverrides(
      base,
      { override_gross: 2000, override_commission: 100 },
      20,
    );
    expect(r.gross).toBe(2000);
    expect(r.commission).toBe(100);
    expect(r.net).toBe(1900);
  });

  it("clamps negative overrides to 0", () => {
    const r = applyManualOverrides(base, { override_gross: -500 }, 20);
    expect(r.gross).toBe(0);
    expect(r.commission).toBe(0);
  });

  it("ignores non-finite overrides", () => {
    const r = applyManualOverrides(
      base,
      { override_gross: Number.NaN, override_commission: null },
      20,
    );
    expect(r).toEqual(base);
  });
});

describe("hasManualOverrides", () => {
  it("true when a finite override is present", () => {
    expect(hasManualOverrides({ override_gross: 1 })).toBe(true);
    expect(hasManualOverrides({ override_commission: 0 })).toBe(true);
  });

  it("false when empty or non-finite", () => {
    expect(hasManualOverrides(null)).toBe(false);
    expect(hasManualOverrides({})).toBe(false);
    expect(hasManualOverrides({ override_gross: Number.NaN })).toBe(false);
  });
});
