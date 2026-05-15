import { describe, expect, it } from "vitest";
import { calcAdOverlay, calcCampaignDeal } from "./campaign-calc";

describe("calcCampaignDeal — CPM", () => {
  it("100k views at $25 CPM → $2,500 gross", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      cpm_rate: 25,
      views: 100_000,
      default_commission_pct: 20,
    });
    expect(r.cpm_gross).toBe(2_500);
    expect(r.flat_gross).toBe(0);
    expect(r.gross).toBe(2_500);
    expect(r.recast_commission).toBe(500);
    expect(r.creator_take_home).toBe(2_000);
  });

  it("zero views → zero gross", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      cpm_rate: 25,
      views: 0,
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(0);
    expect(r.recast_commission).toBe(0);
    expect(r.ctr_pct).toBe(0);
  });

  it("CTR computed correctly", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      cpm_rate: 25,
      views: 200_000,
      clicks: 4_000,           // 2%
      default_commission_pct: 20,
    });
    expect(r.ctr_pct).toBe(2);
  });

  it("rounds CTR to two decimals", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      views: 333,
      clicks: 11,              // 11/333 × 100 = 3.3033...
      default_commission_pct: 20,
    });
    expect(r.ctr_pct).toBe(3.3);
  });

  it("ignores flat_amount when deal_type=cpm", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      cpm_rate: 10,
      views: 50_000,           // 500 from CPM
      flat_amount: 1_000,      // ignored
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(500);
    expect(r.flat_gross).toBe(0);
  });
});

describe("calcCampaignDeal — flat_fee", () => {
  it("flat fee only — views/CPM ignored", () => {
    const r = calcCampaignDeal({
      deal_type: "flat_fee",
      flat_amount: 1_500,
      cpm_rate: 25,            // ignored
      views: 999_999,          // ignored
      default_commission_pct: 30,
    });
    expect(r.cpm_gross).toBe(0);
    expect(r.flat_gross).toBe(1_500);
    expect(r.gross).toBe(1_500);
    expect(r.recast_commission).toBe(450);
    expect(r.creator_take_home).toBe(1_050);
  });

  it("zero flat → zero everything", () => {
    const r = calcCampaignDeal({
      deal_type: "flat_fee",
      flat_amount: 0,
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(0);
  });
});

describe("calcCampaignDeal — hybrid", () => {
  it("CPM + flat fee both contribute", () => {
    const r = calcCampaignDeal({
      deal_type: "hybrid",
      cpm_rate: 20,
      views: 250_000,          // 5,000
      flat_amount: 500,        // base
      default_commission_pct: 25,
    });
    expect(r.cpm_gross).toBe(5_000);
    expect(r.flat_gross).toBe(500);
    expect(r.gross).toBe(5_500);
    expect(r.recast_commission).toBe(1_375);
    expect(r.creator_take_home).toBe(4_125);
  });

  it("hybrid with zero views still gets flat", () => {
    const r = calcCampaignDeal({
      deal_type: "hybrid",
      cpm_rate: 20,
      views: 0,
      flat_amount: 750,
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(750);
  });
});

describe("calcCampaignDeal — commission resolution", () => {
  it("override wins over default", () => {
    const r = calcCampaignDeal({
      deal_type: "flat_fee",
      flat_amount: 1_000,
      default_commission_pct: 30,
      override_commission_pct: 15,
    });
    expect(r.effective_commission_pct).toBe(15);
    expect(r.recast_commission).toBe(150);
  });

  it("falls back to default when override is null", () => {
    const r = calcCampaignDeal({
      deal_type: "flat_fee",
      flat_amount: 1_000,
      default_commission_pct: 30,
      override_commission_pct: null,
    });
    expect(r.effective_commission_pct).toBe(30);
    expect(r.recast_commission).toBe(300);
  });

  it("0% override is honoured (not coerced to default)", () => {
    const r = calcCampaignDeal({
      deal_type: "flat_fee",
      flat_amount: 1_000,
      default_commission_pct: 30,
      override_commission_pct: 0,
    });
    expect(r.effective_commission_pct).toBe(0);
    expect(r.recast_commission).toBe(0);
    expect(r.creator_take_home).toBe(1_000);
  });
});

describe("calcCampaignDeal — defensive inputs", () => {
  it("negative values clamp to zero", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      cpm_rate: -10,
      views: -100,
      clicks: -5,
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(0);
    expect(r.ctr_pct).toBe(0);
  });

  it("NaN values clamp to zero", () => {
    const r = calcCampaignDeal({
      deal_type: "cpm",
      cpm_rate: NaN,
      views: 100_000,
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(0);
  });
});

describe("calcAdOverlay — livestream overlay", () => {
  it("FanDuel walk-through: $15 CPM, 3,364 CCV, 4 ads/hr, 169h 10m → $34,144.60 gross", () => {
    const r = calcAdOverlay({
      cpm_rate: 15,
      ad_frequency_per_hr: 4,
      ccv: 3_364,
      airtime_minutes: 169 * 60 + 10,
      default_commission_pct: 20,
    });
    expect(r.per_ad).toBeCloseTo(50.46, 2);
    expect(r.per_hour).toBeCloseTo(201.84, 2);
    expect(r.gross).toBeCloseTo(34_144.6, 1);
    expect(r.recast_commission).toBeCloseTo(6_828.92, 1);
    expect(r.creator_take_home).toBeCloseTo(27_315.68, 1);
  });

  it("per-creator commission override beats campaign default", () => {
    const r = calcAdOverlay({
      cpm_rate: 10,
      ad_frequency_per_hr: 2,
      ccv: 1_000,
      airtime_minutes: 60,
      override_commission_pct: 15,
      default_commission_pct: 20,
    });
    expect(r.gross).toBe(20);
    expect(r.effective_commission_pct).toBe(15);
    expect(r.recast_commission).toBe(3);
    expect(r.creator_take_home).toBe(17);
  });

  it("zero airtime → zero gross", () => {
    const r = calcAdOverlay({
      cpm_rate: 15,
      ad_frequency_per_hr: 4,
      ccv: 3_364,
      airtime_minutes: 0,
      default_commission_pct: 20,
    });
    expect(r.per_ad).toBeCloseTo(50.46, 2);
    expect(r.per_hour).toBeCloseTo(201.84, 2);
    expect(r.gross).toBe(0);
    expect(r.recast_commission).toBe(0);
  });

  it("null / undefined inputs clamp to zero", () => {
    const r = calcAdOverlay({
      cpm_rate: null,
      ad_frequency_per_hr: undefined,
      ccv: null,
      airtime_minutes: null,
      default_commission_pct: 20,
    });
    expect(r.per_ad).toBe(0);
    expect(r.gross).toBe(0);
  });
});
