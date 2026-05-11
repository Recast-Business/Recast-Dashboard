import * as React from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EyebrowLabel } from "@/components/recast";
import { useCreators } from "@/hooks/useCreators";
import {
  commissionDollarsFromTiers,
  effectivePctFromTiers,
  tiersFromProfile,
  type CommissionTier,
} from "@/lib/finance/calc";
import { cn, formatUSD } from "@/lib/utils";

/**
 * R3E.3 — when a talent is picked on /calculator, surface their
 * commission structure resolved against an example gross. Three
 * platform columns (OnlyFans, Telegram, Overlay) so Gustavo can sanity
 * check what each platform's deal pays before opening any tab.
 *
 * Inputs:
 *   • Talent id (page-level pick)
 *   • Example monthly gross (defaults to $20K; freely editable)
 *
 * For each platform we resolve the creator's tier table from
 * commission_pct_by_platform (legacy K-2 shape, threshold = tier
 * STARTS at) and run progressive math via commissionDollarsFromTiers.
 * When no tiers exist for a platform (flat or null), we display the
 * stored flat percentage instead.
 *
 * The breakdown lists each slice — $0–$10K @ 30% = $3,000 — so the
 * progressive logic is auditable. Effective rate sits at the bottom
 * of each card.
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

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <EyebrowLabel withRule>
            Resolved commission · {creator.name}
          </EyebrowLabel>
          <p className="mt-1 max-w-[60ch] text-[12px] text-steel">
            Per-platform commission breakdown for an example monthly gross.
            Progressive tier math — each tier applies to its slice
            only.
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
            tiers={tiersFromProfile(creator.commission_pct_by_platform, p.key)}
            flatPct={extractFlatPct(creator.commission_pct_by_platform, p.key)}
            gross={grossNum}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One column per platform
// ─────────────────────────────────────────────────────────────────────

function PlatformResolved({
  label,
  tiers,
  flatPct,
  gross,
}: {
  label: string;
  tiers: CommissionTier[] | null;
  flatPct: number | null;
  gross: number;
}) {
  // No tiers + no flat → nothing on file for this platform.
  if (!tiers && flatPct == null) {
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

  // Flat-only path: single percentage, no slicing.
  if (!tiers && flatPct != null) {
    const dollars = gross * (flatPct / 100);
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
          {flatPct}% of {formatUSD(gross, { decimals: 0 })} gross
        </div>
      </div>
    );
  }

  // Tiered path: progressive slice breakdown.
  const sorted = [...(tiers ?? [])].sort((a, b) => a.threshold - b.threshold);
  const slices: Array<{
    from: number;
    to: number | null;
    pct: number;
    sliceDollars: number;
    commission: number;
  }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i].threshold;
    const to = i + 1 < sorted.length ? sorted[i + 1].threshold : null;
    const sliceCap = to ?? Infinity;
    const consumed = Math.max(0, Math.min(gross, sliceCap) - from);
    slices.push({
      from,
      to,
      pct: sorted[i].pct,
      sliceDollars: consumed,
      commission: consumed * (sorted[i].pct / 100),
    });
  }
  const total = commissionDollarsFromTiers(gross, tiers);
  const effective = effectivePctFromTiers(gross, tiers);

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
        Effective {effective != null ? `${effective.toFixed(1)}%` : "—"} of{" "}
        {formatUSD(gross, { decimals: 0 })}
      </div>

      {/* Slice breakdown — only show slices that have non-zero
          consumed dollars, to keep tiny gross examples readable. */}
      <div className="mt-2.5 space-y-1 border-t border-rule pt-2">
        {slices
          .filter((s) => s.sliceDollars > 0 || s === slices[0])
          .map((s, i) => (
            <div
              key={i}
              className={cn(
                "flex items-baseline justify-between gap-2 text-[11px]",
                s.sliceDollars === 0 && "opacity-40",
              )}
            >
              <span className="text-steel">
                {fmtRange(s.from, s.to)} <span className="text-white/60">@ {s.pct}%</span>
              </span>
              <span className="tabular text-white">
                {s.sliceDollars > 0
                  ? formatUSD(s.commission, { decimals: 0 })
                  : "—"}
              </span>
            </div>
          ))}
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

/** Extract a single flat % from the legacy commission_pct_by_platform.
 *  Returns null when the platform key holds a tier array or no value. */
function extractFlatPct(
  commissionByPlatform: unknown,
  platform: string,
): number | null {
  if (!commissionByPlatform || typeof commissionByPlatform !== "object") return null;
  const v = (commissionByPlatform as Record<string, unknown>)[platform];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
