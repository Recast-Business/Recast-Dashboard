import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorSection } from "@/components/finance/VendorSection";
import { OFIncomeSection } from "@/components/finance/OFIncomeSection";
import { TeleIncomeSection } from "@/components/finance/TeleIncomeSection";
import { EFuseIncomeSummary } from "@/components/finance/EFuseIncomeSummary";
import type { Division } from "@/types/finance";

interface Props {
  division: Division;
  year: number;
}

export function DivisionView({ division, year }: Props) {
  return (
    <Tabs defaultValue="income" className="space-y-4">
      <TabsList>
        <TabsTrigger value="income">Income</TabsTrigger>
        <TabsTrigger value="talent_we_pay">Talents we pay</TabsTrigger>
        <TabsTrigger value="talent_that_pays_us">Talents paying us</TabsTrigger>
      </TabsList>

      <TabsContent value="income">
        {division === "onlyfans" ? (
          <OFIncomeSection year={year} />
        ) : division === "telegram" ? (
          <TeleIncomeSection year={year} />
        ) : (
          <EFuseIncomeSummary year={year} />
        )}
      </TabsContent>

      <TabsContent value="talent_we_pay">
        <VendorSection
          division={division}
          kind="talent_we_pay"
          title="Talents we pay"
          description="Creators and collaborators Recast pays out a share to in this division."
          year={year}
        />
      </TabsContent>
      <TabsContent value="talent_that_pays_us">
        <VendorSection
          division={division}
          kind="talent_that_pays_us"
          title="Talents paying us"
          description="Creators paying Recast its commission share in this division."
          year={year}
        />
      </TabsContent>
    </Tabs>
  );
}
