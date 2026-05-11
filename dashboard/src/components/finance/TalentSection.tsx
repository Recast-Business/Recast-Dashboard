import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TalentInvoiceGrid } from "@/components/finance/TalentInvoiceGrid";
import { TalentWePayGrid } from "@/components/finance/TalentWePayGrid";

/**
 * Phase M-6 → Phase L (C3): Talent section.
 *
 * Two sub-tabs, both rebuilt around the canonical design system:
 *   • Talent Paying Us — invoice grid backed by talent_invoices (C2)
 *   • Talent We Pay    — sister grid backed by vendor_payments where
 *                         vendor.kind = 'talent_we_pay' (C3)
 *
 * Math + per-platform performance lives on the Calculator page.
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
        <TalentWePayGrid year={year} />
      </TabsContent>
    </Tabs>
  );
}
