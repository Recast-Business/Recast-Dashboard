import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteOFDeal,
  useOFDeals,
  useOFPeriodsByDeals,
  type OFDealRow,
} from "@/hooks/useOFDeals";
import { useConfirm } from "@/hooks/useConfirm";
import { OFDealDialog } from "@/components/finance/OFDealDialog";
import { OFPeriodCellDialog } from "@/components/finance/OFPeriodCellDialog";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { ExportPDFButton } from "@/components/ui/export-pdf-button";
import { monthlyAmountColumns, type CSVColumn } from "@/lib/export/csv";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { PieCard } from "@/components/analytics/PieCard";
import { groupSum, periodMonthRange } from "@/lib/analytics/group";
import type { OFPeriodPerformance, PaymentStatusV2 } from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/30 text-muted-foreground",
  partial:
    "bg-gradient-to-r from-emerald-100 from-50% to-rose-100 to-50% text-foreground border-amber-200",
  paid: "bg-emerald-50 text-emerald-900 border-emerald-200",
  overdue: "bg-rose-50 text-rose-900 border-rose-200",
};

interface Props {
  year: number;
  /**
   * R3E: when the page-level TalentPicker is set, scope the visible
   * deal rows to that creator only. `null` / undefined = show all.
   */
  talentFilterId?: string | null;
}

export function OFIncomeSection({ year, talentFilterId }: Props) {
  const { data: deals, isLoading, error } = useOFDeals();
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingDeal, setEditingDeal] = React.useState<OFDealRow | null>(null);

  const filtered = React.useMemo(() => {
    let rows = deals ?? [];
    // R3E: scope to picked talent first (cheap eq), then apply search.
    if (talentFilterId) rows = rows.filter((d) => d.creator_id === talentFilterId);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (d) =>
        d.creator?.name.toLowerCase().includes(q) ||
        d.page_name.toLowerCase().includes(q),
    );
  }, [deals, search, talentFilterId]);

  const dealIds = React.useMemo(() => filtered.map((d) => d.id), [filtered]);
  const { data: periodsByDeal } = useOFPeriodsByDeals(dealIds, year);

  function openAdd() {
    setEditingDeal(null);
    setDialogOpen(true);
  }
  function openEdit(d: OFDealRow) {
    setEditingDeal(d);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-h3">OnlyFans income</h2>
          <p className="text-sm text-muted-foreground">
            One deal per (creator, page). A creator can have multiple pages.
            Recast's commission is variable per deal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCSVButton
            filename={`onlyfans-income-${year}.csv`}
            rows={filtered}
            columns={buildOFCSVColumns(periodsByDeal ?? {})}
          />
          <ExportPDFButton
            filename={`onlyfans-income-${year}.pdf`}
            title={`OnlyFans income — ${year}`}
            rows={filtered}
            columns={buildOFCSVColumns(periodsByDeal ?? {})}
            orientation="landscape"
          />
          <Button onClick={openAdd} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add deal
          </Button>
        </div>
      </div>

      <Input
        placeholder="Search by creator or page name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
          {deals?.length ? "No matches." : "No OnlyFans deals yet — click Add deal to create one."}
        </div>
      )}

      {filtered.length > 0 && (
        <AnalyticsPanel
          storageKey="recast.analytics.onlyfans"
          title="OnlyFans analytics"
        >
          {(period) => {
            const range = periodMonthRange(period);
            const enriched = filtered.map((d) => {
              const cells = periodsByDeal?.[d.id] ?? {};
              let gross = 0, recast = 0, girls = 0;
              for (let m = range.from; m <= range.to; m++) {
                const c = cells[m];
                if (!c) continue;
                gross += Number(c.gross_revenue) || 0;
                recast += Number(c.recast_commission) || 0;
                girls += Number(c.girls_share) || 0;
              }
              return { deal: d, gross, recast, girls };
            });
            return (
              <>
                <PieCard
                  title="Gross by page"
                  data={groupSum(enriched, {
                    key: (e) => e.deal.page_name,
                    value: (e) => e.gross,
                    topN: 8,
                  })}
                />
                <PieCard
                  title="Recast share by page"
                  data={groupSum(enriched, {
                    key: (e) => e.deal.page_name,
                    value: (e) => e.recast,
                    topN: 8,
                  })}
                />
                <PieCard
                  title="Girls share by page"
                  data={groupSum(enriched, {
                    key: (e) => e.deal.page_name,
                    value: (e) => e.girls,
                    topN: 8,
                  })}
                />
              </>
            );
          }}
        </AnalyticsPanel>
      )}

      <div className="space-y-2">
        {filtered.map((d) => (
          <DealRow
            key={d.id}
            deal={d}
            year={year}
            periods={periodsByDeal?.[d.id] ?? {}}
            onEdit={() => openEdit(d)}
          />
        ))}
      </div>

      <OFDealDialog open={dialogOpen} onOpenChange={setDialogOpen} deal={editingDeal} />
    </div>
  );
}

interface DealRowProps {
  deal: OFDealRow;
  year: number;
  periods: Record<number, OFPeriodPerformance>;
  onEdit: () => void;
}

function DealRow({ deal, year, periods, onEdit }: DealRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [editingMonth, setEditingMonth] = React.useState<number | null>(null);
  const del = useDeleteOFDeal();
  const confirm = useConfirm();

  const totals = React.useMemo(() => {
    let gross = 0, net = 0, commission = 0, girls = 0, paidCount = 0;
    for (const p of Object.values(periods)) {
      gross += Number(p.gross_revenue) || 0;
      net += Number(p.net_revenue) || 0;
      commission += Number(p.recast_commission) || 0;
      girls += Number(p.girls_share) || 0;
      if (p.status === "paid") paidCount++;
    }
    return { gross, net, commission, girls, paidCount };
  }, [periods]);

  async function onDelete() {
    const ok = await confirm({
      title: `Delete "${deal.page_name}" deal?`,
      description: "This wipes all monthly performance for this page.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(deal.id);
      toast.success("Deal deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{deal.page_name}</span>
            <span className="text-xs text-muted-foreground">{deal.creator?.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              {deal.recast_pct}% on {deal.basis}
            </span>
          </div>
        </div>
        <div className="hidden gap-3 text-xs sm:flex">
          <Stat label="Gross" value={formatUSD(totals.gross, { decimals: 0 })} />
          <Stat label="Recast" value={formatUSD(totals.commission, { decimals: 0 })} />
          <Stat label="Girls" value={formatUSD(totals.girls, { decimals: 0 })} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            Monthly performance — {year}
          </div>
          <div className="grid grid-cols-12 gap-1 text-xs">
            {MONTHS.map((label, i) => {
              const month = i + 1;
              const p = periods[month];
              const status = p?.status ?? "unpaid";
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => setEditingMonth(month)}
                  title={
                    p?.gross_revenue != null && Number(p.gross_revenue) > 0
                      ? formatUSD(p.gross_revenue, { decimals: 2 })
                      : undefined
                  }
                  className={cn(
                    "flex flex-col items-stretch gap-1 rounded-md border px-2 py-2 text-left transition hover:border-primary/50",
                    STATUS_STYLES[status],
                  )}
                >
                  <div className="text-[11px] font-medium uppercase tracking-wider">{label}</div>
                  <div className="text-sm font-semibold tabular-nums">
                    {p?.gross_revenue != null && Number(p.gross_revenue) > 0
                      ? formatUSDCompact(Number(p.gross_revenue))
                      : "—"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-md border bg-muted/20 p-3">
            <Stat label="Gross YTD" value={formatUSD(totals.gross, { decimals: 2 })} />
            <Stat label="Net" value={formatUSD(totals.net, { decimals: 2 })} />
            <Stat label="Recast commission" value={formatUSD(totals.commission, { decimals: 2 })} />
            <Stat label="Girls share" value={formatUSD(totals.girls, { decimals: 2 })} emphasised />
            {/* R5 Sweep 1 (Gustavo, T1): "Paid months" stat removed —
                payment status moves out of the calculator. */}
          </div>

          <div className="flex items-center gap-2 pt-1">
            {/* R5 Sweep 1 (Gustavo, T1): "Log payment" moves to the
                dedicated /payments sidebar page (Sweep 5). The OF
                deal row stays focused on the deal terms (page name +
                commission). */}
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit page
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={del.isPending}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          </div>

          {editingMonth != null && (
            <OFPeriodCellDialog
              open
              onOpenChange={(o) => !o && setEditingMonth(null)}
              deal={deal}
              year={year}
              month={editingMonth}
              existing={periods[editingMonth] ?? null}
            />
          )}

        </div>
      )}
    </div>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  // M-5: bumped sizes — Frazier asked for the key numbers to be easier to
  // read at a glance. Was text-base / text-lg; now text-xl / text-2xl
  // emphasised, with the label at xs.
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={
          emphasised
            ? "text-2xl font-semibold tabular-nums"
            : "text-xl font-medium tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

function buildOFCSVColumns(
  periodsByDeal: Record<string, Record<number, OFPeriodPerformance>>,
): CSVColumn<OFDealRow>[] {
  const base: CSVColumn<OFDealRow>[] = [
    { header: "Creator", value: (d) => d.creator?.name ?? "" },
    { header: "Page", value: (d) => d.page_name },
    { header: "Recast %", value: (d) => d.recast_pct },
    { header: "Basis", value: (d) => d.basis },
    { header: "Active", value: (d) => (d.active ? "yes" : "no") },
  ];
  const gross = monthlyAmountColumns<OFDealRow>((d, m) => {
    return Number(periodsByDeal[d.id]?.[m]?.gross_revenue ?? 0) || null;
  }).map((c) => ({ ...c, header: c.header === "Total" ? "Gross Total" : `Gross ${c.header}` }));
  const recast = monthlyAmountColumns<OFDealRow>((d, m) => {
    return Number(periodsByDeal[d.id]?.[m]?.recast_commission ?? 0) || null;
  }).map((c) => ({ ...c, header: c.header === "Total" ? "Recast Total" : `Recast ${c.header}` }));
  const girls = monthlyAmountColumns<OFDealRow>((d, m) => {
    return Number(periodsByDeal[d.id]?.[m]?.girls_share ?? 0) || null;
  }).map((c) => ({ ...c, header: c.header === "Total" ? "Girls Total" : `Girls ${c.header}` }));
  return [...base, ...gross, ...recast, ...girls];
}
