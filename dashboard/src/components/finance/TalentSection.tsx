import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TalentInvoiceGrid } from "@/components/finance/TalentInvoiceGrid";
import { VendorSection } from "@/components/finance/VendorSection";

/**
 * Phase M-6: Talent section restructure.
 *
 * Replaces the K-5-rest TalentTab (which nested OnlyFans / Telegram /
 * Overlay sub-tabs and rendered a DivisionView per division). Per
 * Gustavo: only two sub-tabs.
 *
 *   • Talent Paying Us — invoice tracking grid (default)
 *   • Talent We Pay    — vendor-style talent_we_pay rows (existing)
 *
 * Math + per-platform performance moved to the Calculator section (M-5).
 */

interface Props {
  year: number;
}

export function TalentSection({ year }: Props) {
  return (
    <Tabs defaultValue="paying-us" className="space-y-4">
      <TabsList className="h-9">
        <TabsTrigger value="paying-us" className="px-3 text-xs">
          Talent Paying Us
        </TabsTrigger>
        <TabsTrigger value="we-pay" className="px-3 text-xs">
          Talent We Pay
        </TabsTrigger>
      </TabsList>

      <TabsContent value="paying-us">
        <TalentInvoiceGrid year={year} />
      </TabsContent>

      <TabsContent value="we-pay">
        {/* M-6: keep the existing VendorSection for talent_we_pay rows
            (one-off contractors / non-creator humans we pay flat amounts).
            Cross-division so all talent we pay shows in one place. */}
        <VendorSection
          kind="talent_we_pay"
          title="Talent We Pay"
          description="One-off contractors and collaborators Recast pays a flat amount to. Use the Vendors tab for company-style vendors."
          year={year}
        />
      </TabsContent>
    </Tabs>
  );
}
