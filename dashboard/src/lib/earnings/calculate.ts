import {
  DEAL_COMPONENT_LABELS,
  type DealComponent,
  type EarningsBreakdownItem,
  type EarningsResult,
  type ManualInputs,
} from "@/types/deal";

export function computeComponent(c: DealComponent): EarningsBreakdownItem {
  const label = c.label ?? DEAL_COMPONENT_LABELS[c.type];
  switch (c.type) {
    case "flat_fee":
      return { type: c.type, label, amount: max0(c.amount) };
    case "per_post": {
      const amount = max0(c.rate) * max0(c.posts);
      return {
        type: c.type,
        label,
        amount,
        detail: `${c.posts} × $${c.rate}`,
      };
    }
    case "per_stream": {
      const amount = max0(c.rate) * max0(c.streams);
      return {
        type: c.type,
        label,
        amount,
        detail: `${c.streams} × $${c.rate}`,
      };
    }
    case "rev_share": {
      const raw = (max0(c.percent) / 100) * max0(c.revenue);
      const amount = Math.max(raw, c.minGuarantee ?? 0);
      const detail =
        c.minGuarantee !== undefined && raw < c.minGuarantee
          ? `MG applied ($${c.minGuarantee} > ${c.percent}% of $${c.revenue})`
          : `${c.percent}% of $${c.revenue}`;
      return { type: c.type, label, amount, detail };
    }
    case "tiered_bonus": {
      const mode = c.mode ?? "highest";
      const sorted = [...c.tiers].sort((a, b) => a.threshold - b.threshold);
      const reached = sorted.filter((t) => c.metric >= t.threshold);
      let amount = 0;
      let detail: string;
      if (reached.length === 0) {
        amount = 0;
        detail = `metric ${c.metric} below first tier`;
      } else if (mode === "cumulative") {
        amount = reached.reduce((sum, t) => sum + t.bonus, 0);
        detail = `cumulative ${reached.length} tiers hit`;
      } else {
        const top = reached[reached.length - 1];
        amount = top.bonus;
        detail = `hit tier ≥ ${top.threshold}`;
      }
      return { type: c.type, label, amount, detail };
    }
    case "daily_log": {
      const amount = max0(c.ratePerDay) * max0(c.days);
      return {
        type: c.type,
        label,
        amount,
        detail: `${c.days} days × $${c.ratePerDay}`,
      };
    }
    case "weekly_cap": {
      const raw = max0(c.ratePerHour) * max0(c.hours) + max0(c.priorRollover ?? 0);
      const amount = Math.min(raw, max0(c.weeklyCap));
      const capped = raw > c.weeklyCap;
      return {
        type: c.type,
        label,
        amount,
        detail: capped
          ? `capped at $${c.weeklyCap} (earned $${raw.toFixed(2)})`
          : `${c.hours}h × $${c.ratePerHour}`,
      };
    }
    case "cpm": {
      const amount = max0(c.rate) * (max0(c.impressions) / 1000);
      return {
        type: c.type,
        label,
        amount,
        detail: `${c.impressions.toLocaleString()} impressions × $${c.rate}/1k`,
      };
    }
  }
}

export function computeEarnings(
  components: DealComponent[],
  commissionRate: number,
): EarningsResult {
  const breakdown = components.map(computeComponent);
  const gross = round2(breakdown.reduce((sum, b) => sum + b.amount, 0));
  const commission = round2((gross * clampRate(commissionRate)) / 100);
  const net = round2(gross - commission);
  return { gross, breakdown, commission, net };
}

export function applyManualOverrides(
  base: EarningsResult,
  manual: ManualInputs | null | undefined,
  commissionRate: number,
): EarningsResult {
  if (!manual) return base;

  const hasGrossOverride =
    manual.override_gross != null && Number.isFinite(manual.override_gross);
  const hasCommissionOverride =
    manual.override_commission != null &&
    Number.isFinite(manual.override_commission);

  if (!hasGrossOverride && !hasCommissionOverride) return base;

  const gross = hasGrossOverride ? max0(manual.override_gross as number) : base.gross;
  const commission = hasCommissionOverride
    ? max0(manual.override_commission as number)
    : hasGrossOverride
      ? (gross * clampRate(commissionRate)) / 100
      : base.commission;
  const net = gross - commission;

  return {
    gross: round2(gross),
    breakdown: base.breakdown,
    commission: round2(commission),
    net: round2(net),
  };
}

export function hasManualOverrides(manual: ManualInputs | null | undefined): boolean {
  if (!manual) return false;
  return (
    (manual.override_gross != null && Number.isFinite(manual.override_gross)) ||
    (manual.override_commission != null &&
      Number.isFinite(manual.override_commission))
  );
}

function max0(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.max(0, Math.min(rate, 100));
}
