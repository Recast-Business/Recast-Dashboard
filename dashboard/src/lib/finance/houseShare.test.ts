import { describe, expect, it } from "vitest";
import {
  planCombinedAllocation,
  utilityShareForResident,
  pickCentRemainderResident,
  utilityMonthTotal,
} from "./houseShare";
import type { HouseResident, HouseUtilityPayment } from "@/types/finance";

// Test fixtures
function r(name: string, id = name.toLowerCase()): HouseResident {
  return {
    id,
    name,
    active: true,
    created_at: "2026-01-01",
  } as HouseResident;
}
function util(amount: number, id = "u1"): HouseUtilityPayment {
  // Cast through unknown — only the shape that `utilityMonthTotal`
  // reads is relevant for these tests; the rest is row metadata.
  return {
    id,
    utility_id: id,
    period_year: 2026,
    period_month: 1,
    amount,
    amount_paid: 0,
    status: "unpaid",
  } as unknown as HouseUtilityPayment;
}

describe("pickCentRemainderResident", () => {
  it("picks Frazier when present", () => {
    const list = [r("Charlotte"), r("Frazier"), r("Dax")];
    expect(pickCentRemainderResident(list)).toBe(1);
  });

  it("falls back to first resident when no Frazier", () => {
    expect(pickCentRemainderResident([r("Alice"), r("Bob")])).toBe(0);
  });

  it("case-insensitive Frazier match", () => {
    expect(pickCentRemainderResident([r("alice"), r("FRAZIER")])).toBe(1);
  });
});

describe("utilityShareForResident — equal-per-head with cent remainder", () => {
  it("splits evenly when divisible", () => {
    const residents = [r("A"), r("B"), r("C")];
    // $300 / 3 = $100 each
    for (let i = 0; i < 3; i++) {
      expect(
        utilityShareForResident({ residents, residentIdx: i, monthTotal: 300 }),
      ).toBe(100);
    }
  });

  it("gives the cent remainder to Frazier", () => {
    const residents = [r("Charlotte"), r("Frazier"), r("Dax")];
    // $100 / 3 = $33.33 each, $0.01 remainder to Frazier (idx 1) → $33.34
    expect(
      utilityShareForResident({ residents, residentIdx: 0, monthTotal: 100 }),
    ).toBe(33.33);
    expect(
      utilityShareForResident({ residents, residentIdx: 1, monthTotal: 100 }),
    ).toBe(33.34);
    expect(
      utilityShareForResident({ residents, residentIdx: 2, monthTotal: 100 }),
    ).toBe(33.33);
  });

  it("returns 0 for empty resident list", () => {
    expect(
      utilityShareForResident({ residents: [], residentIdx: 0, monthTotal: 300 }),
    ).toBe(0);
  });

  it("returns 0 when month total is 0", () => {
    expect(
      utilityShareForResident({
        residents: [r("A")],
        residentIdx: 0,
        monthTotal: 0,
      }),
    ).toBe(0);
  });
});

describe("utilityMonthTotal", () => {
  it("sums every utility's amount for the given month", () => {
    const map = {
      u1: { 1: util(50, "u1"), 2: util(75, "u1") },
      u2: { 1: util(30, "u2"), 2: util(40, "u2") },
    };
    expect(utilityMonthTotal(map, 1)).toBe(80);
    expect(utilityMonthTotal(map, 2)).toBe(115);
    expect(utilityMonthTotal(map, 3)).toBe(0);
  });

  it("treats undefined map as 0", () => {
    expect(utilityMonthTotal(undefined, 1)).toBe(0);
  });
});

describe("planCombinedAllocation — Gus's scenario", () => {
  it("Charlotte pays $1500, owes $1000 rent + $500 utilities for Jan → exact 2:1 split", () => {
    const plan = planCombinedAllocation({
      amount: 1500,
      owedByMonth: [
        {
          period_year: 2026,
          period_month: 1,
          rent_owed: 1000,
          utility_owed: 500,
        },
      ],
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].rent_apply).toBe(1000);
    expect(plan.steps[0].utility_apply).toBe(500);
    expect(plan.steps[0].total_apply).toBe(1500);
    expect(plan.unallocated).toBe(0);
  });

  it("smaller payment splits proportionally — $750 against $1000+$500", () => {
    const plan = planCombinedAllocation({
      amount: 750,
      owedByMonth: [
        {
          period_year: 2026,
          period_month: 1,
          rent_owed: 1000,
          utility_owed: 500,
        },
      ],
    });
    // $750 × 1000/1500 = $500 rent, $250 utility
    expect(plan.steps[0].rent_apply).toBe(500);
    expect(plan.steps[0].utility_apply).toBe(250);
  });
});

describe("planCombinedAllocation — rounding rule (Gus #7)", () => {
  it("residual cent goes to RENT when rent is the larger portion", () => {
    // Rent $100.01, utility $50 → combined $150.01.
    // Pay $99 → 99 × 100.01 / 150.01 in cents:
    //   floor(9900 × 10001 / 15001) = floor(6600.66) = 6600 cents rent
    //   utility = 9900 - 6600 = 3300 cents → 33.00
    // Rent owed > utility owed → rule applies: cent residual to rent
    //   if there was a non-zero residual (here floor 6600.66 dropped 0.66 → utility got it)
    //   shift one cent: rent 6601, utility 3299
    const plan = planCombinedAllocation({
      amount: 99,
      owedByMonth: [
        {
          period_year: 2026,
          period_month: 1,
          rent_owed: 100.01,
          utility_owed: 50,
        },
      ],
    });
    expect(plan.steps[0].rent_apply).toBe(66.01);
    expect(plan.steps[0].utility_apply).toBe(32.99);
    expect(plan.steps[0].rent_apply + plan.steps[0].utility_apply).toBeCloseTo(99, 2);
  });

  it("residual cent stays on UTILITY when utility is the larger portion", () => {
    // Rent $50, utility $100.01 → combined $150.01.
    // Pay $99 → floor(9900 × 5000 / 15001) = floor(3299.78) = 3299 rent
    //                                       utility = 6601
    // Utility is the larger portion, so residual stays on utility.
    const plan = planCombinedAllocation({
      amount: 99,
      owedByMonth: [
        {
          period_year: 2026,
          period_month: 1,
          rent_owed: 50,
          utility_owed: 100.01,
        },
      ],
    });
    expect(plan.steps[0].rent_apply).toBe(32.99);
    expect(plan.steps[0].utility_apply).toBe(66.01);
  });
});

describe("planCombinedAllocation — FIFO across months", () => {
  it("walks oldest unpaid months first", () => {
    const plan = planCombinedAllocation({
      amount: 2000,
      owedByMonth: [
        { period_year: 2026, period_month: 1, rent_owed: 1000, utility_owed: 500 },
        { period_year: 2026, period_month: 2, rent_owed: 1000, utility_owed: 500 },
        { period_year: 2026, period_month: 3, rent_owed: 1000, utility_owed: 500 },
      ],
    });
    // $2000 covers Jan fully ($1500), leaves $500 for Feb (partial).
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].period_month).toBe(1);
    expect(plan.steps[0].total_apply).toBe(1500);
    expect(plan.steps[1].period_month).toBe(2);
    expect(plan.steps[1].total_apply).toBe(500);
    // March untouched (no step).
    expect(plan.unallocated).toBe(0);
  });

  it("reports unallocated when payment exceeds total combined owed", () => {
    const plan = planCombinedAllocation({
      amount: 5000,
      owedByMonth: [
        { period_year: 2026, period_month: 1, rent_owed: 1000, utility_owed: 500 },
      ],
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].total_apply).toBe(1500);
    expect(plan.unallocated).toBe(3500);
  });

  it("skips months with combined_owed = 0", () => {
    const plan = planCombinedAllocation({
      amount: 1000,
      owedByMonth: [
        { period_year: 2026, period_month: 1, rent_owed: 0, utility_owed: 0 },
        { period_year: 2026, period_month: 2, rent_owed: 800, utility_owed: 200 },
      ],
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].period_month).toBe(2);
    expect(plan.steps[0].total_apply).toBe(1000);
  });
});

describe("planCombinedAllocation — edges", () => {
  it("returns no steps when amount is 0", () => {
    const plan = planCombinedAllocation({
      amount: 0,
      owedByMonth: [
        { period_year: 2026, period_month: 1, rent_owed: 1000, utility_owed: 500 },
      ],
    });
    expect(plan.steps).toHaveLength(0);
    expect(plan.unallocated).toBe(0);
  });

  it("handles only-rent-owed months (utility share is 0)", () => {
    const plan = planCombinedAllocation({
      amount: 500,
      owedByMonth: [
        { period_year: 2026, period_month: 1, rent_owed: 1000, utility_owed: 0 },
      ],
    });
    expect(plan.steps[0].rent_apply).toBe(500);
    expect(plan.steps[0].utility_apply).toBe(0);
  });

  it("handles only-utility-owed months (rent already settled)", () => {
    const plan = planCombinedAllocation({
      amount: 300,
      owedByMonth: [
        { period_year: 2026, period_month: 1, rent_owed: 0, utility_owed: 500 },
      ],
    });
    expect(plan.steps[0].rent_apply).toBe(0);
    expect(plan.steps[0].utility_apply).toBe(300);
  });
});
