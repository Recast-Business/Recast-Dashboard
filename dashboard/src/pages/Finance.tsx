import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TalentSection } from "@/components/finance/TalentSection";
import { HouseSection } from "@/components/finance/HouseSection";
import { VendorSection } from "@/components/finance/VendorSection";
import { OverdueDrawer } from "@/components/finance/OverdueDrawer";

/**
 * Phase M-6: Top tabs are Talent / House / Vendors.
 *
 * The K-5-rest nested OnlyFans/Telegram/Overlay sub-tabs are gone —
 * those three divisions are math-only and live under the Calculator
 * section (M-5). The Talent section here is pure AR / invoice
 * tracking with two sub-tabs (Talent Paying Us / Talent We Pay).
 */

export function FinancePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h2 tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">
            Vendors, talents, and household ledgers across Recast. Year-by-year
            payment grid with full audit trail on banking access.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      <OverdueDrawer />

      <Tabs defaultValue="talent" className="space-y-4">
        <TabsList className="h-10">
          <TabsTrigger value="talent" className="px-4">
            Talent
          </TabsTrigger>
          <TabsTrigger value="house" className="px-4">
            Frazier's House
          </TabsTrigger>
          <TabsTrigger value="vendors" className="px-4">
            Vendors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="talent">
          <TalentSection year={year} />
        </TabsContent>

        <TabsContent value="house">
          <HouseSection year={year} />
        </TabsContent>

        <TabsContent value="vendors">
          <VendorSection
            kind="vendor"
            title="Vendors"
            description="Companies, contractors and recurring bills Recast pays — across all divisions and the org as a whole."
            year={year}
            showDivisionFilter
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Year selector
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
