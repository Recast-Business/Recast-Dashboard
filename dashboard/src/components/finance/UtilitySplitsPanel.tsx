import * as React from "react";
import { Card } from "@/components/ui/card";
import { EyebrowLabel, MoneyCell } from "@/components/recast";
import type { HouseResident, HouseUtilityPayment } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

/**
 * Phase M-3b: per-resident utility split panel.
 *
 * Equal-per-head split of monthly utility bills. Cent remainders go
 * to Frazier so each column reconciles to the utility total exactly.
 *
 * Math:
 *   monthlyTotal_m  = Σ utility.amount[m] across all active utilities
 *   baseCents       = floor(monthlyTotal_m * 100 / activeResidentCount)
 *   share_resident  = baseCents / 100   for everyone except Frazier
 *   share_Frazier   = (baseCents + (monthlyTotal_m * 100 − baseCents *
 *                     activeResidentCount)) / 100
 *
 * If a resident named Frazier isn't found, the first resident absorbs
 * the cent remainder so the column always sums correctly.
 *
 * Visual: identical recipe to the rent + utility grids on /house —
 * sticky-left bg-#0d0d0d, hairline borders only, MoneyCell at body
 * size in Unbounded, current-month label bold + white, future months
 * dimmed at 40% opacity. A TOTAL row at the bottom shows the per-
 * month utility-bill totals; column sums always match exactly thanks
 * to the cent-remainder rule.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  residents: HouseResident[];
  utilByUtility: Record<string, Record<number, HouseUtilityPayment>> | undefined;
  currentMonthIdx: number | null;
}

export function UtilitySplitsPanel({ residents, utilByUtility, currentMonthIdx }: Props) {
  const activeCount = residents.length;

  // Per-month total across every utility row.
  const monthlyTotals = React.useMemo<number[]>(() => {
    const totals = Array(12).fill(0);
    if (!utilByUtility) return totals;
    for (const utilityId of Object.keys(utilByUtility)) {
      for (let m = 1; m <= 12; m++) {
        totals[m - 1] += Number(utilByUtility[utilityId]?.[m]?.amount) || 0;
      }
    }
    return totals;
  }, [utilByUtility]);

  // Locate Frazier (by name) so cent remainders go to the right resident.
  const frazierIdx = React.useMemo(() => {
    const idx = residents.findIndex((r) => r.name.toLowerCase().includes("frazier"));
    return idx >= 0 ? idx : 0;
  }, [residents]);

  // Per-resident per-month share with cent-remainder rule.
  function shareFor(residentIdx: number, monthIdx: number): number {
    const total = monthlyTotals[monthIdx];
    if (total <= 0 || activeCount === 0) return 0;
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / activeCount);
    const remainderCents = totalCents - baseCents * activeCount;
    if (residentIdx === frazierIdx) {
      return (baseCents + remainderCents) / 100;
    }
    return baseCents / 100;
  }

  if (activeCount === 0) {
    return (
      <Card className="px-tile-md py-6 text-center text-[13px] text-steel">
        Add an active resident to compute the per-head utility split.
      </Card>
    );
  }

  const yearTotal = monthlyTotals.reduce((s, t) => s + t, 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-rule px-tile-md py-3.5">
        <EyebrowLabel withRule>Splits · per resident</EyebrowLabel>
        <h2 className="mt-1.5 text-[13px] font-semibold tracking-[-0.005em] text-white">
          Utilities split equal-per-head
        </h2>
        <p className="mt-0.5 text-[11px] text-steel">
          {activeCount} active resident{activeCount === 1 ? "" : "s"} · cent
          remainders go to Frazier so each column reconciles exactly.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-rule">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[200px] bg-[#0d0d0d] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.13em] text-steel"
              >
                Resident
              </th>
              {MONTHS.map((label, i) => {
                const isCurrent = currentMonthIdx === i;
                const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                return (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      "min-w-[80px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.13em]",
                      isCurrent ? "text-white" : isFuture ? "text-steel/40" : "text-steel",
                    )}
                  >
                    {label}
                    {isCurrent ? <span className="ml-1 text-electric">·</span> : null}
                  </th>
                );
              })}
              <th
                scope="col"
                className="min-w-[110px] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.13em] text-steel"
              >
                YTD
              </th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r, rIdx) => {
              const yearlyShare = monthlyTotals.reduce(
                (sum, _t, mIdx) => sum + shareFor(rIdx, mIdx),
                0,
              );
              const isFrazier = rIdx === frazierIdx;
              return (
                <tr
                  key={r.id}
                  className="border-b border-rule transition-colors duration-base ease-out hover:bg-white/[0.04]"
                >
                  <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2">
                    <div className="text-[13px] font-medium text-white">
                      {r.name}
                      {isFrazier ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-electric">
                          remainder
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-steel">{r.bedroom}</div>
                  </td>
                  {MONTHS.map((_label, i) => {
                    const share = shareFor(rIdx, i);
                    const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                    return (
                      <td
                        key={i}
                        className={cn(
                          "px-2 py-2 text-center align-middle",
                          isFuture && "opacity-50",
                        )}
                      >
                        {share > 0 ? (
                          <MoneyCell
                            amount={share}
                            size="body"
                            splitDecimals={false}
                          />
                        ) : (
                          <span className="text-[12px] text-steel/40">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    {yearlyShare > 0 ? (
                      <MoneyCell
                        amount={yearlyShare}
                        size="body"
                        splitDecimals={false}
                      />
                    ) : (
                      <span className="text-[12px] text-steel">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* TOTAL row — column sums must match the utility-bill totals
                exactly thanks to the cent-remainder rule. Tinted blue to
                signal "this column reconciles". */}
            <tr className="bg-[rgba(37,99,235,0.04)]">
              <td className="sticky left-0 z-10 bg-[#0d0d0d] px-4 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-electric">
                  Total · reconciles
                </div>
                <div className="text-[11px] text-steel">All utilities combined</div>
              </td>
              {monthlyTotals.map((t, i) => {
                const isFuture = currentMonthIdx !== null && i > currentMonthIdx;
                return (
                  <td
                    key={i}
                    className={cn(
                      "px-2 py-2.5 text-center align-middle",
                      isFuture && "opacity-50",
                    )}
                  >
                    {t > 0 ? (
                      <span className="tabular font-display text-[13px] font-bold text-white">
                        {formatUSD(t, { decimals: 0 })}
                      </span>
                    ) : (
                      <span className="text-[12px] text-steel/40">—</span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-right">
                {yearTotal > 0 ? (
                  <span className="tabular font-display text-[13px] font-bold text-white">
                    {formatUSD(yearTotal, { decimals: 0 })}
                  </span>
                ) : (
                  <span className="text-[12px] text-steel">—</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
