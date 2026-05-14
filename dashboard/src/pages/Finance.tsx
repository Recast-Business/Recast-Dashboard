import * as React from "react";
import { TalentSection } from "@/components/finance/TalentSection";
import { OverdueDrawer } from "@/components/finance/OverdueDrawer";

/**
 * Round 3D follow-up (Gustavo): /finance is the Talent ledger only.
 *
 * Frazier's House and Vendors used to be sub-tabs here back when the
 * sidebar didn't surface them. Now that both have dedicated sidebar
 * entries (`/house` and `/vendors`) the duplicate tabs were just
 * extra clicks — they're gone. /finance still owns:
 *
 *   • Talent Paying Us (creator → us invoices)
 *   • Talent We Pay    (us → contractor payments)
 *   • Year selector
 *   • Overdue drawer
 *
 * No tabs at the top level; the Talent section internally tabs
 * between "Paying Us" and "We Pay".
 */

export function FinancePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = React.useState(currentYear);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h2">Invoice</h1>
          <p className="text-sm text-muted-foreground">
            Talent invoices Recast issues + contractor payment grid.
            Year-by-year view with full audit trail on banking access.
            Vendors and Frazier&apos;s House live in their own sidebar
            sections.
          </p>
        </div>
        <YearSelector value={year} onChange={setYear} />
      </div>

      <OverdueDrawer />

      <TalentSection year={year} />
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
