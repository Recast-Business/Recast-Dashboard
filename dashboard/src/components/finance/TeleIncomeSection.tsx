import * as React from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteTeleDeal,
  useTeleDeals,
  useTelePeriodsByCreators,
  type TeleDealRow,
} from "@/hooks/useTeleDeals";
import { useConfirm } from "@/hooks/useConfirm";
import { TeleDealDialog } from "@/components/finance/TeleDealDialog";
import { TelePeriodCellDialog } from "@/components/finance/TelePeriodCellDialog";
import type { PaymentStatusV2, TelePeriodPerformance } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLES: Record<PaymentStatusV2, string> = {
  unpaid: "bg-muted/30 text-muted-foreground",
  partial: "bg-amber-50 text-amber-900 border-amber-200",
  paid: "bg-emerald-50 text-emerald-900 border-emerald-200",
  overdue: "bg-rose-50 text-rose-900 border-rose-200",
};

interface Props {
  year: number;
}

export function TeleIncomeSection({ year }: Props) {
  const { data: deals, isLoading, error } = useTeleDeals();
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingDeal, setEditingDeal] = React.useState<TeleDealRow | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals ?? [];
    return (deals ?? []).filter((d) =>
      d.creator?.name.toLowerCase().includes(q),
    );
  }, [deals, search]);

  const creatorIds = React.useMemo(() => filtered.map((d) => d.creator_id), [filtered]);
  const { data: periodsByCreator } = useTelePeriodsByCreators(creatorIds, year);

  function openAdd() {
    setEditingDeal(null);
    setDialogOpen(true);
  }
  function openEdit(d: TeleDealRow) {
    setEditingDeal(d);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Telegram income</h2>
          <p className="text-sm text-muted-foreground">
            Per-creator deals with optional Min Guarantee. Net is auto-calculated as
            50% of gross (Telegram platform fee). Recast commission applies to net + top-up.
          </p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add deal
        </Button>
      </div>

      <Input
        placeholder="Search by creator name…"
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
          {deals?.length ? "No matches." : "No Telegram deals yet — click Add deal to create one."}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((d) => (
          <DealRow
            key={d.id}
            deal={d}
            year={year}
            periods={periodsByCreator?.[d.creator_id] ?? {}}
            onEdit={() => openEdit(d)}
          />
        ))}
      </div>

      <TeleDealDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        deal={editingDeal}
      />
    </div>
  );
}

interface DealRowProps {
  deal: TeleDealRow;
  year: number;
  periods: Record<number, TelePeriodPerformance>;
  onEdit: () => void;
}

function DealRow({ deal, year, periods, onEdit }: DealRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [editingMonth, setEditingMonth] = React.useState<number | null>(null);
  const del = useDeleteTeleDeal();
  const confirm = useConfirm();

  const totals = React.useMemo(() => {
    let gross = 0, net = 0, topUp = 0, commission = 0, takeHome = 0, paidCount = 0;
    for (const p of Object.values(periods)) {
      gross += Number(p.gross_revenue) || 0;
      net += Number(p.net_revenue) || 0;
      topUp += Number(p.mg_top_up) || 0;
      commission += Number(p.recast_commission) || 0;
      takeHome += (Number(p.net_revenue) || 0) + (Number(p.mg_top_up) || 0) - (Number(p.recast_commission) || 0);
      if (p.status === "paid") paidCount++;
    }
    return { gross, net, topUp, commission, takeHome, paidCount };
  }, [periods]);

  async function onDelete() {
    const ok = await confirm({
      title: `Delete deal for ${deal.creator?.name ?? "creator"}?`,
      description: "This wipes all monthly performance history. Cannot be undone.",
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
            <span className="truncate font-medium">{deal.creator?.name ?? "Unknown creator"}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              {deal.recast_commission_pct}% on {deal.commission_basis}
            </span>
            {deal.min_guarantee != null && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-900">
                MG {formatUSD(deal.min_guarantee, { decimals: 0 })}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {deal.contract_start} → {deal.contract_end}
          </div>
        </div>
        <div className="hidden gap-3 text-xs sm:flex">
          <Stat label="Gross" value={formatUSD(totals.gross, { decimals: 0 })} />
          <Stat label="Commission" value={formatUSD(totals.commission, { decimals: 0 })} />
          <Stat label="Take-home" value={formatUSD(totals.takeHome, { decimals: 0 })} />
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
                  className={cn(
                    "flex flex-col items-stretch rounded-md border px-1.5 py-1 text-left transition hover:border-primary/50",
                    STATUS_STYLES[status],
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] font-medium">
                    <span>{label}</span>
                    {p?.qualified_for_mg && p?.mg_top_up > 0 && (
                      <span className="rounded bg-amber-200 px-1 text-[8px] text-amber-950">MG</span>
                    )}
                  </div>
                  <div className="truncate text-[11px]">
                    {p?.gross_revenue != null && Number(p.gross_revenue) > 0
                      ? formatUSD(p.gross_revenue, { decimals: 0 })
                      : "—"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-md border bg-muted/20 p-3">
            <Stat label="Gross YTD" value={formatUSD(totals.gross, { decimals: 0 })} />
            <Stat label="Net" value={formatUSD(totals.net, { decimals: 0 })} />
            {totals.topUp > 0 && <Stat label="MG top-ups" value={formatUSD(totals.topUp, { decimals: 0 })} emphasised />}
            <Stat label="Recast commission" value={formatUSD(totals.commission, { decimals: 0 })} />
            <Stat label="Creator take-home" value={formatUSD(totals.takeHome, { decimals: 0 })} emphasised />
            <Stat label="Paid months" value={`${totals.paidCount}/12`} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3 w-3" /> Edit deal
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
            <TelePeriodCellDialog
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
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={emphasised ? "text-lg font-semibold tabular-nums" : "text-base tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
