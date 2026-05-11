import * as React from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EyebrowLabel } from "@/components/recast";
import { useCreators } from "@/hooks/useCreators";
import {
  commissionDollarsFromTiers,
  effectivePctFromTiers,
  tiersFromProfile,
  type CommissionMode,
  type CommissionTier,
} from "@/lib/finance/calc";
import { cn, formatUSD } from "@/lib/utils";

/**
 * R3E.3 — when a talent is picked on /calculator, surface their
 * commission structure resolved against an example gross. Three
 * platform columns (OnlyFans, Telegram, Overlay) so Gustavo can sanity
 * check what each platform's deal pays before opening any tab.
 *
 * R3 Q1+Q7 update:
 *   • Reads from the canonical commission_tiers column first via
 *     tiersFromProfile (legacy commission_pct_by_platform stays as a
 *     fallback during the migration window).
 *   • Honours the per-creator commission_uses_cliff toggle. When ON,
 *     the card shows a single-rate cliff result. When OFF (default),
 *     the slice-by-slice progressive breakdown.
 *   • A mode chip in the header labels which math you're seeing.
 */

interface Props {
  talentId: string | null;
}

const PLATFORMS: Array<{
  key: "onlyfans" | "telegram" | "efuse";
  label: string;
}> = [
  { key: "onlyfans", label: "OnlyFans" },
  { key: "telegram", label: "Telegram" },
  { key: "efuse", label: "Ad Overlay" },
];

export function CommissionResolvedCard({ talentId }: Props) {
  const { data: creators } = useCreators("signed");
  const [exampleGross, setExampleGross] = React.useState<string>("20000");

  if (!talentId) return null;

  const creator = (creators ?? []).find((c) => c.id === talentId);
  if (!creator) return null;

  const grossNum = Math.max(0, Number(exampleGross) || 0);
  const mode: CommissionMode = creator.commission_uses_cliff
    ? "cliff"
    : "progressive";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <EyebrowLabel withRule>
              Resolved commission · {creator.name}
            </EyebrowLabel>
            <ModeChip mode={mode} />
          </div>
          <p className="mt-1 max-w-[60ch] text-[12px] text-steel">
            {mode === "cliff" ? (
              <>
                Legacy cliff math — the tier the creator reaches applies
                its pct to the entire monthly gross. Toggle this off
                from the talent profile to switch to progressive.
              </>
            ) : (
              <>
                Per-platform commission breakdown for an example monthly
                gross. Progressive — each tier applies to its slice
                only.
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-steel">
          Example monthly gross:
          <span className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-steel">$</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="100"
              value={exampleGross}
              onChange={(e) => setExampleGross(e.target.value)}
              className="h-8 w-[140px] pl-6 text-[13px]"
            />
          </span>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLATFORMS.map((p) => (
          <PlatformResolved
            key={p.key}
            label={p.label}
            tiers={tiersFromProfile(creator, p.key)}
            gross={grossNum}
            mode={mode}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header mode chip
// ─────────────────────────────────────────────────────────────────────

function ModeChip({ mode }: { mode: CommissionMode }) {
  if (mode === "cliff") {
    return (
      <span className="rounded-sm bg-overdue-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-overdue">
        Legacy cliff
      </span>
    );
  }
  return (
    <span className="rounded-sm bg-paid-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paid">
      Progressive
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One column per platform
// ─────────────────────────────────────────────────────────────────────

function PlatformResolved({
  label,
  tiers,
  gross,
  mode,
}: {
  label: string;
  tiers: CommissionTier[] | null;
  gross: number;
  mode: CommissionMode;
}) {
  // No tiers → nothing on file for this platform.
  if (!tiers || tiers.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-rule p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
          <Calculator className="h-3 w-3" strokeWidth={1.5} />
          {label}
        </div>
        <div className="mt-2 text-[12px] text-steel">
          No commission set. Edit the talent profile to add one.
        </div>
      </div>
    );
  }

  // Flat detect: a single tier with threshold:null is a flat rate
  // covering everything. Display as a simpler card with no slice
  // breakdown — same in either mode (cliff == progressive when only
  // one tier exists).
  const isFlat = tiers.length === 1 && tiers[0].threshold === null;
  if (isFlat) {
    const pct = tiers[0].pct;
    const dollars = gross * (pct / 100);
    return (
      <div className="rounded-md border bg-[#0d0d0d] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
            <Calculator className="h-3 w-3" strokeWidth={1.5} />
            {label}
          </div>
          <span className="rounded-sm bg-electric/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-electric">
            Flat
          </span>
        </div>
        <div className="tabular mt-2 font-display text-[20px] font-extrabold leading-none text-white">
          {formatUSD(dollars, { decimals: 0 })}
        </div>
        <div className="mt-1 text-[11px] text-steel">
          {pct}% of {formatUSD(gross, { decimals: 0 })} gross
        </div>
      </div>
    );
  }

  // Tiered. Build slices: tier 0's slice is $0–threshold[0], tier i's
  // slice is threshold[i-1]–threshold[i], terminal tier's slice is
  // threshold[n-1]–∞. Under progressive each slice contributes its
  // own commission; under cliff the bucket containing gross gets
  // the whole gross × its pct.
  const sorted = [...tiers].sort((a, b) => {
    if (a.threshold === null) return 1;
    if (b.threshold === null) return -1;
    return a.threshold - b.threshold;
  });
  const slices: Array<{
    from: number;
    to: number | null;
    pct: number;
    sliceConsumed: number;
    sliceCommission: number;
    isActiveCliffTier: boolean;
  }> = [];
  let prevThreshold = 0;
  let cliffBucketFound = false;
  for (let i = 0; i < sorted.length; i++) {
    const from = prevThreshold;
    const to = sorted[i].threshold;
    const sliceCap = to ?? Infinity;
    const consumed = Math.max(0, Math.min(gross, sliceCap) - from);
    // Cliff selects the tier whose range contains gross — i.e. first
    // tier with end ≥ gross (and we haven't yet found it).
    const isActiveCliffTier =
      mode === "cliff" && !cliffBucketFound && gross <= sliceCap;
    if (isActiveCliffTier) cliffBucketFound = true;
    slices.push({
      from,
      to,
      pct: sorted[i].pct,
      sliceConsumed: consumed,
      sliceCommission:
        mode === "cliff"
          ? isActiveCliffTier
            ? gross * (sorted[i].pct / 100)
            : 0
          : consumed * (sorted[i].pct / 100),
      isActiveCliffTier,
    });
    prevThreshold = sliceCap;
  }
  const total = commissionDollarsFromTiers(gross, tiers, mode);
  const effective = effectivePctFromTiers(gross, tiers, mode);

  return (
    <div className="rounded-md border bg-[#0d0d0d] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-steel">
          <Calculator className="h-3 w-3" strokeWidth={1.5} />
          {label}
        </div>
        <span className="rounded-sm bg-partial-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-partial">
          Tiered
        </span>
      </div>

      <div className="tabular mt-2 font-display text-[20px] font-extrabold leading-none text-white">
        {formatUSD(total, { decimals: 0 })}
      </div>
      <div className="mt-1 text-[11px] text-steel">
        {mode === "cliff" ? "Cliff rate" : "Effective"}{" "}
        {effective != null ? `${effective.toFixed(1)}%` : "—"} of{" "}
        {formatUSD(gross, { decimals: 0 })}
      </div>

      {/* Slice breakdown. Under progressive every consumed slice gets
          its own line. Under cliff the active bucket lights up
          highlighted and shows the whole-month math; other tiers are
          rendered dimmed for context. */}
      <div className="mt-2.5 space-y-1 border-t border-rule pt-2">
        {slices.map((s, i) => {
          const dim =
            mode === "cliff"
              ? !s.isActiveCliffTier
              : s.sliceConsumed === 0;
          return (
            <div
              key={i}
              className={cn(
                "flex items-baseline justify-between gap-2 text-[11px]",
                dim && "opacity-40",
                mode === "cliff" && s.isActiveCliffTier && "text-electric",
              )}
            >
              <span className="text-steel">
                {fmtRange(s.from, s.to)} <span className="text-white/60">@ {s.pct}%</span>
              </span>
              <span className="tabular text-white">
                {mode === "cliff"
                  ? s.isActiveCliffTier
                    ? formatUSD(s.sliceCommission, { decimals: 0 })
                    : "—"
                  : s.sliceConsumed > 0
                    ? formatUSD(s.sliceCommission, { decimals: 0 })
                    : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtRange(from: number, to: number | null): string {
  const f = compactDollar(from);
  const t = to != null ? compactDollar(to) : "∞";
  return `${f}–${t}`;
}

function compactDollar(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
