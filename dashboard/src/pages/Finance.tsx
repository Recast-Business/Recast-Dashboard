import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TalentSection } from "@/components/finance/TalentSection";
import { VendorInvoicesSection } from "@/components/finance/VendorInvoicesSection";
import { OverdueDrawer } from "@/components/finance/OverdueDrawer";
import { YearSelector } from "@/components/recast";
import { useSharedYear } from "@/hooks/useSharedYear";

/**
 * /finance — the dashboard's invoice home.
 *
 * Bruno separation: two top-level tabs so talent invoices and vendor
 * invoices manage independently. Vendor Ledger (/vendors) keeps just
 * profiles + the recurring grid; vendor *invoicing* lives here.
 *
 *   • Talent tab     — TalentSection sub-tabs (paying us / we pay)
 *   • Vendor tab     — cross-vendor ad-hoc invoice list with filter
 *
 * Year selector + overdue drawer span both tabs.
 */

export function FinancePage() {
  // Round-1 efficiency: year pick persists across pages/sessions.
  const [year, setYear] = useSharedYear();

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h2">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Talent invoices Recast issues + cross-vendor invoice log.
            Frazier&apos;s House and the vendor recurring grid live in
            their own sidebar sections.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      <OverdueDrawer />

      <Tabs defaultValue="talent" className="space-y-4">
        <TabsList className="h-10">
          <TabsTrigger value="talent" className="px-4">
            Talent Invoices
          </TabsTrigger>
          <TabsTrigger value="vendor" className="px-4">
            Vendor Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="talent">
          <TalentSection year={year} />
        </TabsContent>

        <TabsContent value="vendor">
          <VendorInvoicesSection year={year} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
