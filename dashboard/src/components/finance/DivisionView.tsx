import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorSection } from "@/components/finance/VendorSection";
import type { Division } from "@/types/finance";

interface Props {
  division: Division;
  year: number;
}

export function DivisionView({ division, year }: Props) {
  return (
    <Tabs defaultValue="vendor" className="space-y-4">
      <TabsList>
        <TabsTrigger value="vendor">Vendors</TabsTrigger>
        <TabsTrigger value="talent_we_pay">Talents we pay</TabsTrigger>
        <TabsTrigger value="talent_that_pays_us">Talents paying us</TabsTrigger>
        <TabsTrigger value="credit_card_account">Credit cards</TabsTrigger>
      </TabsList>

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
