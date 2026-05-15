import { describe, expect, it } from "vitest";
import { effectiveInvoiceStatus, resolveDeadline } from "./invoiceStatus";

describe("effectiveInvoiceStatus — paid resolves first", () => {
  it("returns paid when amount_paid >= amount, even if due date has passed", () => {
    const inv = {
      amount: 1000,
      amount_paid: 1000,
      due_date: "2020-01-01",
    };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("paid");
  });

  it("treats over-payment as paid", () => {
    const inv = { amount: 1000, amount_paid: 1500, due_date: "2026-05-30" };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("paid");
  });
});

describe("effectiveInvoiceStatus — partial", () => {
  it("returns partial when 0 < paid < amount, regardless of due date", () => {
    const futureDue = { amount: 1000, amount_paid: 500, due_date: "2026-12-31" };
    const pastDue = { amount: 1000, amount_paid: 500, due_date: "2020-01-01" };
    expect(effectiveInvoiceStatus(futureDue, new Date("2026-05-15"))).toBe("partial");
    expect(effectiveInvoiceStatus(pastDue, new Date("2026-05-15"))).toBe("partial");
  });
});

describe("effectiveInvoiceStatus — overdue", () => {
  it("flips unpaid (paid=0) to overdue when due_date is in the past", () => {
    const inv = { amount: 1000, amount_paid: 0, due_date: "2026-04-30" };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("overdue");
  });

  it("stays unpaid when due_date is in the future", () => {
    const inv = { amount: 1000, amount_paid: 0, due_date: "2026-06-30" };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("unpaid");
  });

  it("derives deadline from period_year + period_month when due_date is null (vendor_payments side)", () => {
    // Period = April 2026 → EOM is 2026-04-30. Today = May 15 → overdue.
    const inv = {
      amount: 1000,
      amount_paid: 0,
      due_date: null,
      period_year: 2026,
      period_month: 4,
    };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("overdue");
  });

  it("doesn't flip overdue while still inside the period month", () => {
    // Period = May 2026. Today = May 15. EOM is May 31 → not yet overdue.
    const inv = {
      amount: 1000,
      amount_paid: 0,
      due_date: null,
      period_year: 2026,
      period_month: 5,
    };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("unpaid");
  });
});

describe("effectiveInvoiceStatus — edge cases", () => {
  it("returns unpaid for zero-amount rows (defensive)", () => {
    const inv = { amount: 0, amount_paid: 0, due_date: "2020-01-01" };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("unpaid");
  });

  it("returns unpaid when no deadline info is available and paid = 0", () => {
    const inv = { amount: 1000, amount_paid: 0 };
    expect(effectiveInvoiceStatus(inv, new Date("2026-05-15"))).toBe("unpaid");
  });
});

describe("resolveDeadline", () => {
  it("prefers explicit due_date over period_year/month", () => {
    const d = resolveDeadline({
      amount: 100,
      amount_paid: 0,
      due_date: "2026-03-15",
      period_year: 2026,
      period_month: 7,
    });
    expect(d?.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("derives EOM when due_date is null", () => {
    const d = resolveDeadline({
      amount: 100,
      amount_paid: 0,
      due_date: null,
      period_year: 2026,
      period_month: 2,
    });
    // Feb 2026 has 28 days (not a leap year).
    expect(d?.getMonth()).toBe(1); // 0-indexed Feb
    expect(d?.getDate()).toBe(28);
  });

  it("handles leap year February correctly", () => {
    const d = resolveDeadline({
      amount: 100,
      amount_paid: 0,
      due_date: null,
      period_year: 2024,
      period_month: 2,
    });
    expect(d?.getDate()).toBe(29);
  });

  it("returns null when neither due_date nor period info is present", () => {
    const d = resolveDeadline({ amount: 100, amount_paid: 0 });
    expect(d).toBeNull();
  });
});
