import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OFIncomeSection } from "@/components/finance/OFIncomeSection";
import { TeleIncomeSection } from "@/components/finance/TeleIncomeSection";
import { EFuseIncomeSummary } from "@/components/finance/EFuseIncomeSummary";
import { EyebrowLabel, YearSelector } from "@/components/recast";
import { TalentPicker } from "@/components/calculator/TalentPicker";
import { CommissionResolvedCard } from "@/components/calculator/CommissionResolvedCard";
import { AdOverlayCalculator } from "@/components/calculator/AdOverlayCalculator";
import { useSharedYear } from "@/hooks/useSharedYear";

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
  // Round-1 efficiency: year pick persists across pages/sessions.
  const [year, setYear] = useSharedYear();

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
          {/* Deals tab = Ad Overlay calculator (reference math, with
              an inline "Open Campaigns" CTA in its footer) + the
              EFuseIncomeSummary read-out scoped to the picked
              talent. The old standalone DealsPointer card was
              folded into the calculator footer so the tab is one
              coherent surface instead of two competing ones. */}
          <AdOverlayCalculator />
          <EFuseIncomeSummary year={year} talentFilterId={talentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

