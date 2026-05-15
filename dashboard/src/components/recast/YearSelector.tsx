import * as React from "react";
import { cn } from "@/lib/utils";

interface YearSelectorProps {
  value: number;
  onChange: (year: number) => void;
  /** Years before the current year to include. Default 2 → now-2…now+2. */
  yearsBefore?: number;
  /** Years after the current year to include. Default 2. */
  yearsAfter?: number;
  className?: string;
}

/**
 * Page-header year picker. Stacked label-above-select layout, used
 * across Calculator / Finance / Overview / TaxTracker / Campaigns.
 *
 * Was duplicated five times across pages; factored here so visual
 * tweaks land in one place.
 */
export function YearSelector({
  value,
  onChange,
  yearsBefore = 2,
  yearsAfter = 2,
  className,
}: YearSelectorProps) {
  const now = new Date().getFullYear();
  const years = React.useMemo(
    () =>
      Array.from(
        { length: yearsBefore + yearsAfter + 1 },
        (_, i) => now - yearsBefore + i,
      ),
    [now, yearsBefore, yearsAfter],
  );
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-steel">
        Year
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-md border bg-background px-2 text-sm"
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
