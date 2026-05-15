import * as React from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OFIncomeSection } from "@/components/finance/OFIncomeSection";
import { TeleIncomeSection } from "@/components/finance/TeleIncomeSection";
import { EFuseIncomeSummary } from "@/components/finance/EFuseIncomeSummary";
import { EyebrowLabel } from "@/components/recast";
import { TalentPicker } from "@/components/calculator/TalentPicker";
import { CommissionResolvedCard } from "@/components/calculator/CommissionResolvedCard";
import { AdOverlayCalculator } from "@/components/calculator/AdOverlayCalculator";

/**
 * Calculator page — math home.
 *
 * Phase M-5 shipped this as the math-only counterpart to the Talent
 * ledger (AR / invoices). Round 3 E layers a talent picker over the
 * whole thing: pick a creator at the top and every sub-tab scopes to
 * that creator's deals, plus a resolved-commission card shows their
 * per-platform tier math against an example monthly gross.
 *
 * Sub-tabs:
 *   • OnlyFans   — per-page deals + monthly performance grid
 *   • Telegram   — per-creator deals + monthly performance grid
 *   • Deals      — pointer to /campaigns (which already does brand-
 *                  deal math end-to-end; no duplicate engine here)
 *   • Ad Overlay — Overlay / eFuse campaign tracker
 *
 * Tier math (R3E.1) is now PROGRESSIVE (Gustavo decision B) — each
 * slice billed at its own pct, blended into an effective rate that
 * still flows through the existing commission_basis logic. See
 * dashboard/src/lib/finance/calc.ts header for the spec.
 */

export function CalculatorPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);

  // Page-level state: a single optional talent filter applied to all
  // four sub-tabs. Lifting it up keeps tab-switching cheap (no
  // remount-loses-pick UX gotcha) and lets the picker live next to
  // the year selector in the page header.
  const [talentId, setTalentId] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="border-b pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
        Workspace · Calculator
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EyebrowLabel withRule>Calculator · {year}</EyebrowLabel>
          <h1 className="mt-2 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
            Calculator
          </h1>
          <p className="mt-2.5 max-w-[60ch] text-[13.5px] font-normal leading-[1.55] text-steel">
            Performance and revenue math. Pick a talent to scope every
            sub-tab to their deals and resolve their commission tiers
            against an example gross — or leave it cleared for the
            full-division view.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col items-start gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
              Talent
            </span>
            <TalentPicker value={talentId} onChange={setTalentId} />
          </div>
          <YearSelector value={year} onChange={setYear} />
        </div>
      </div>

      {/* Resolved-commission card shows up only when a talent is
          picked. Hides for the unfiltered roll-up view because the
          card is creator-specific. */}
      <CommissionResolvedCard talentId={talentId} />

      <Tabs defaultValue="onlyfans" className="space-y-4">
        <TabsList className="h-10">
          <TabsTrigger value="onlyfans" className="px-4">
            OnlyFans
          </TabsTrigger>
          <TabsTrigger value="telegram" className="px-4">
            Telegram
          </TabsTrigger>
          {/* R5 follow-up (Gus): "Ad Overlay" tab merged INTO "Deals".
              Both surfaces were about brand-deal math + visibility, so
              splitting them across two tabs forced unnecessary clicks.
              Deals now shows the Campaigns pointer plus the per-
              campaign overlay performance read-out underneath. */}
          <TabsTrigger value="deals" className="px-4">
            Deals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="onlyfans">
          <OFIncomeSection year={year} talentFilterId={talentId} />
        </TabsContent>

        <TabsContent value="telegram">
          <TeleIncomeSection year={year} talentFilterId={talentId} />
        </TabsContent>

        <TabsContent value="deals" className="space-y-4">
          {/* Live Ad Overlay math — operators sweep CPM / CCV /
              frequency / airtime to model what a given creator
              would earn on a livestream-overlay sponsorship. */}
          <AdOverlayCalculator />
          <DealsPointer />
          {/* R3E follow-up + R5 merge: scopes to campaigns where the
              picked creator is attached. With no talent picked, full
              division roll-up like before. */}
          <EFuseIncomeSummary year={year} talentFilterId={talentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Deals tab — pointer to /campaigns
//
// R3F note: rather than duplicating the campaign math engine here,
// the Deals tab links to the existing /campaigns page (8-type deal
// structures, expandable cards, finance hub roll-ups). One source of
// truth for one-off deal accounting.
// ─────────────────────────────────────────────────────────────────────

function DealsPointer() {
  return (
    <div className="rounded-lg border bg-card p-6 text-sm">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-h3 font-bold tracking-[-0.02em]">
            One-off deal math lives on Campaigns
          </h3>
          <p className="mt-1 max-w-[60ch] text-steel">
            Brand-deal accounting (flat fee, per-stream rates, CPM
            bonuses, hybrid stacks) runs end-to-end on the Campaigns
            page — expandable creator rows, per-deal commission, and
            full payment-status tracking. We don't duplicate that math
            here so there's a single source of truth.
          </p>
          <Link
            to="/campaigns"
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-electric hover:underline"
          >
            Open Campaigns <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Year selector — copied from Finance.tsx so this page is self-contained
// ─────────────────────────────────────────────────────────────────────

function YearSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (y: number) => void;
}) {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => now - 2 + i);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
        Year
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-md border bg-background px-2 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
