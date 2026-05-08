import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorSection } from "@/components/finance/VendorSection";
import { OFIncomeSection } from "@/components/finance/OFIncomeSection";
import { TeleIncomeSection } from "@/components/finance/TeleIncomeSection";
import type { Division } from "@/types/finance";

interface Props {
  division: Division;
  year: number;
}

export function DivisionView({ division, year }: Props) {
  // OF and Telegram have an extra "Income" tab as the first (default) tab
  const hasIncome = division === "onlyfans" || division === "telegram";
  const defaultTab = hasIncome ? "income" : "vendor";

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        {hasIncome && <TabsTrigger value="income">Income</TabsTrigger>}
        <TabsTrigger value="vendor">Vendors</TabsTrigger>
        <TabsTrigger value="talent_we_pay">Talents we pay</TabsTrigger>
        <TabsTrigger value="talent_that_pays_us">Talents paying us</TabsTrigger>
        <TabsTrigger value="credit_card_account">Credit cards</TabsTrigger>
      </TabsList>

      {hasIncome && (
        <TabsContent value="income">
          {division === "onlyfans" ? (
            <OFIncomeSection year={year} />
          ) : (
            <TeleIncomeSection year={year} />
          )}
        </TabsContent>
      )}

      <TabsContent value="vendor">
        <VendorSection
          division={division}
          kind="vendor"
          title="Vendors"
          description="Companies and contractors Recast pays for services."
          year={year}
        />
      </TabsContent>
      <TabsContent value="talent_we_pay">
        <VendorSection
          division={division}
          kind="talent_we_pay"
          title="Talents we pay"
          description="Creators and collaborators Recast pays out a share to."
          year={year}
        />
      </TabsContent>
      <TabsContent value="talent_that_pays_us">
        <VendorSection
          division={division}
          kind="talent_that_pays_us"
          title="Talents that pay us"
          description="Creators paying Recast its commission share."
          year={year}
        />
      </TabsContent>
      <TabsContent value="credit_card_account">
        <VendorSection
          division={division}
          kind="credit_card_account"
          title="Credit cards"
          description="Cards Recast uses to pay vendors. Tag transactions to a card."
          year={year}
        />
      </TabsContent>
    </Tabs>
  );
}
