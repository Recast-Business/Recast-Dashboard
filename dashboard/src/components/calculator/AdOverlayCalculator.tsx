import * as React from "react";
import { ExternalLink, Tv } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyCell } from "@/components/recast";
import { calcAdOverlay } from "@/lib/finance/campaign-calc";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Ad Overlay revenue projector.
 *
 * Live math for a livestream-overlay sponsorship (FanDuel, eFuse,
 * etc). Per-airing revenue scales with CCV; per-hour revenue scales
 * with ad frequency; monthly revenue scales with airtime. Every
 * input is editable so operators can sweep ranges as a campaign's
 * CPM, CCV, or airtime shifts.
 *
 *   per ad airing  = (CCV / 1000) × CPM
 *   per hour       = per ad airing × ads/hr
 *   monthly gross  = per hour × (airtime_hr + airtime_min/60)
 *
 * Recast commission is taken from monthly gross at the operator-
 * supplied rate (defaults to 20%). No persistence — this is a
 * back-of-the-envelope tool, not a stored deal. When a campaign
 * needs to be locked in, it gets created on /campaigns with the
 * resolved numbers.
 */

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  suffix,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-steel">
        {label}
      </Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className={cn("tabular", suffix ? "pr-10" : "")}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-steel">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AdOverlayCalculator() {
  // Inputs start empty (Gus: the card is a how-the-math-works
  // reference, not a stored example — operators punch in the
  // current campaign's CPM / CCV / frequency / airtime fresh
  // every time). Commission keeps a 20% structural default
  // because it's a config knob, not an example value.
  const [cpm, setCpm] = React.useState(0);
  const [ccv, setCcv] = React.useState(0);
  const [adsPerHr, setAdsPerHr] = React.useState(0);
  const [airtimeHr, setAirtimeHr] = React.useState(0);
  const [airtimeMin, setAirtimeMin] = React.useState(0);
  const [commissionPct, setCommissionPct] = React.useState(20);

  const airtimeHours = airtimeHr + airtimeMin / 60;
  const airtimeMinutes = airtimeHr * 60 + airtimeMin;
  const calc = calcAdOverlay({
    cpm_rate: cpm,
    ad_frequency_per_hr: adsPerHr,
    ccv,
    airtime_minutes: airtimeMinutes,
    default_commission_pct: Math.max(0, Math.min(commissionPct, 100)),
  });
  const perAd = calc.per_ad;
  const perHour = calc.per_hour;
  const monthlyGross = calc.gross;
  const recastCut = calc.recast_commission;
  const creatorNet = calc.creator_take_home;

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start gap-3">
        <Tv className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-h3 font-bold tracking-[-0.02em]">
            Ad Overlay revenue projector
          </h3>
          <p className="mt-1 max-w-[64ch] text-[13px] text-steel">
            Livestream-overlay sponsorship math. Edit any value as the
            campaign evolves — CPM, CCV, frequency, and airtime are
            all in scope.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <NumberField
          label="CPM"
          value={cpm}
          onChange={setCpm}
          step={0.5}
          suffix="$ / 1k"
        />
        <NumberField
          label="CCV"
          value={ccv}
          onChange={setCcv}
          step={50}
          suffix="ppl"
        />
        <NumberField
          label="Frequency"
          value={adsPerHr}
          onChange={setAdsPerHr}
          step={1}
          suffix="ads/hr"
        />
        <NumberField
          label="Airtime hr"
          value={airtimeHr}
          onChange={setAirtimeHr}
          step={1}
          suffix="hr"
        />
        <NumberField
          label="Airtime min"
          value={airtimeMin}
          onChange={setAirtimeMin}
          step={5}
          suffix="min"
        />
        <NumberField
          label="Commission"
          value={commissionPct}
          onChange={setCommissionPct}
          step={1}
          suffix="%"
        />
      </div>

      {/* Step-through breakdown. Shows the formula collapsing
          one step at a time so the math is auditable. */}
      <dl className="mt-5 grid grid-cols-1 gap-2 rounded-md border bg-background/40 p-4 text-[12.5px] sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel">
            Per ad airing
          </dt>
          <dd className="tabular text-white">
            {formatUSD(perAd, { decimals: 2 })}
          </dd>
          <dd className="text-[11px] text-steel">
            {ccv.toLocaleString()} ÷ 1,000 × ${cpm}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel">
            Per hour
          </dt>
          <dd className="tabular text-white">
            {formatUSD(perHour, { decimals: 2 })}
          </dd>
          <dd className="text-[11px] text-steel">
            × {adsPerHr} ads/hr
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel">
            Airtime
          </dt>
          <dd className="tabular text-white">{airtimeHours.toFixed(2)} hr</dd>
          <dd className="text-[11px] text-steel">
            {airtimeHr}h {airtimeMin}m
          </dd>
        </div>
      </dl>

      {/* Split row — gross / commission / creator net. */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border bg-background/40 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel">
            Monthly gross
          </div>
          <MoneyCell
            amount={monthlyGross}
            size="display"
            splitDecimals={false}
            className="mt-1"
          />
        </div>
        <div className="rounded-md border bg-background/40 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel">
            Recast commission · {commissionPct}%
          </div>
          <MoneyCell
            amount={recastCut}
            size="display"
            splitDecimals={false}
            className="mt-1 text-electric"
          />
        </div>
        <div className="rounded-md border bg-background/40 p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-steel">
            Creator nets
          </div>
          <MoneyCell
            amount={creatorNet}
            size="display"
            splitDecimals={false}
            className="mt-1 text-paid"
          />
        </div>
      </div>

      {/* CTA footer — this calculator is a math reference; real deals
          get created on /campaigns where the rate card + per-month
          CCV/airtime persist and feed Overview. */}
      <div className="mt-4 flex items-start gap-2 border-t border-rule pt-3 text-[12px] text-steel">
        <span className="flex-1">
          This is a reference tool. To lock these numbers in for a real
          creator, create an Ad Overlay campaign and enter the per-month
          CCV + airtime there.
        </span>
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-electric hover:underline"
        >
          Open Campaigns <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
