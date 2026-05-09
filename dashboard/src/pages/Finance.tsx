import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DivisionView } from "@/components/finance/DivisionView";
import { HouseSection } from "@/components/finance/HouseSection";
import { VendorSection } from "@/components/finance/VendorSection";
import { OverdueDrawer } from "@/components/finance/OverdueDrawer";
import type { Division } from "@/types/finance";

const DIVISIONS: { value: Division; label: string }[] = [
  { value: "onlyfans", label: "OnlyFans" },
  { value: "telegram", label: "Telegram" },
  { value: "efuse", label: "Overlay" },
];

export function FinancePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">
            Vendors, talents, and household ledgers across Recast. Year-by-year
            payment grid with full audit trail on banking access.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      <OverdueDrawer />

      <Tabs defaultValue="onlyfans" className="space-y-4">
        <TabsList className="h-10 flex-wrap">
          {DIVISIONS.map((d) => (
            <TabsTrigger key={d.value} value={d.value} className="px-4">
              {d.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="house" className="px-4">
            Frazier's House
          </TabsTrigger>
          <TabsTrigger value="vendors" className="px-4">
            Vendors
          </TabsTrigger>
        </TabsList>

        {DIVISIONS.map((d) => (
          <TabsContent key={d.value} value={d.value}>
            <DivisionView division={d.value} year={year} />
          </TabsContent>
        ))}

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
