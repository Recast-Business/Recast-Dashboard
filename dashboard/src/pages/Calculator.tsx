import * as React from "react";
import { Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OFIncomeSection } from "@/components/finance/OFIncomeSection";
import { TeleIncomeSection } from "@/components/finance/TeleIncomeSection";
import { EFuseIncomeSummary } from "@/components/finance/EFuseIncomeSummary";

/**
 * Phase M-5: Calculator page — the math home Gustavo asked for.
 *
 * Renamed from "Campaigns" in the sidebar. All performance + revenue
 * calculations live here so the Talent section (M-6) can become pure
 * AR / invoice tracking.
 *
 * Sub-tabs:
 *   • OnlyFans   — per-page deals + monthly performance grid (existing OFIncomeSection)
 *   • Telegram   — per-creator deals + monthly performance grid (existing TeleIncomeSection)
 *   • Deals      — placeholder for one-off deal math (lands in a follow-up
 *                  if Gustavo's real-use surfaces a structured need)
 *   • Ad Overlay — eFuse / Overlay campaign tracker (existing EFuseIncomeSummary)
 *
 * Out of scope for M-5
 * ────────────────────
 * Once Calculator owns the math, M-6 will strip the Income sub-tab out of
 * the Talent → DivisionView so there's no duplication. M-5 ships side-by-
 * side temporarily to keep migrations safe.
 */

export function CalculatorPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calculator</h1>
          <p className="text-sm text-muted-foreground">
            Performance and revenue math. Enter raw numbers per platform —
            gross / net / commission splits compute automatically and feed
            the Talent section's invoices.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      <Tabs defaultValue="onlyfans" className="space-y-4">
        <TabsList className="h-10">
          <TabsTrigger value="onlyfans" className="px-4">
            OnlyFans
          </TabsTrigger>
          <TabsTrigger value="telegram" className="px-4">
            Telegram
          </TabsTrigger>
          <TabsTrigger value="deals" className="px-4">
            Deals
          </TabsTrigger>
          <TabsTrigger value="overlay" className="px-4">
            Ad Overlay
          </TabsTrigger>
        </TabsList>

        <TabsContent value="onlyfans">
          <OFIncomeSection year={year} />
        </TabsContent>

        <TabsContent value="telegram">
          <TeleIncomeSection year={year} />
        </TabsContent>

        <TabsContent value="deals">
          <DealsPlaceholder />
        </TabsContent>

        <TabsContent value="overlay">
          <EFuseIncomeSummary year={year} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Deals placeholder
// ─────────────────────────────────────────────────────────────────────

function DealsPlaceholder() {
  return (
    <div className="rounded-lg border bg-card p-6 text-sm">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">One-off deal calculator</h3>
          <p className="mt-1 text-muted-foreground">
            Coming next iteration. This tab will host the math for one-off brand
            deals + project work that don't fit the recurring monthly grids:
            enter gross / net / Recast share / contract dates and get the
            invoice numbers Frazier sends out.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            For now, recurring per-creator deal math lives under the OnlyFans
            and Telegram tabs above.
          </p>
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
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Year:</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border bg-background px-2 py-1 text-sm"
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
