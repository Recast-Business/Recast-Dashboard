import * as React from "react";
import { ExternalLink, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreators } from "@/hooks/useCreators";
import { useTalentInvoicesByYear } from "@/hooks/useTalentInvoices";
import { TalentInvoiceDialog } from "@/components/finance/TalentInvoiceDialog";
import type { PaymentStatusV2, TalentInvoice } from "@/types/finance";
import { cn, formatUSD, formatUSDCompact } from "@/lib/utils";

/**
 * Phase M-6: Talent Paying Us — invoice tracking grid.
 *
 * Creators × 12 months. Each cell shows the invoice for that month
 * (status-tinted, amount + invoice number). Clicking a cell opens
 * TalentInvoiceDialog — creates a new invoice if the cell is empty,
 * edits the existing one otherwise. URL-bearing cells show a small
 * external-link icon and the cell is treated as a Sheets-style link
 * (cmd-click to open the invoice URL directly without opening the
 * dialog; plain click still opens the dialog).
 */

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
}

export function TalentInvoiceGrid({ year }: Props) {
  const { data: creators, isLoading: creatorsLoading } = useCreators("signed");
  const { data: invoiceMap, isLoading: invoicesLoading } = useTalentInvoicesByYear(year);

  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<TalentInvoice | null>(null);
  const [creating, setCreating] = React.useState<{
    creatorId: string;
    year: number;
    month: number;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creators ?? [];
    return (creators ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [creators, search]);

  function openCell(creatorId: string, month: number) {
    const existing = invoiceMap?.[creatorId]?.[month];
    if (existing) {
      setEditing(existing);
      setCreating(null);
    } else {
      setCreating({ creatorId, year, month });
      setEditing(null);
    }
    setDialogOpen(true);
  }
  function openCreateBlank() {
    setEditing(null);
    setCreating(null);
    setDialogOpen(true);
  }

  // Yearly totals across visible creators
  const totals = React.useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let invoiceCount = 0;
    let paidCount = 0;
    for (const c of filtered) {
      const cells = invoiceMap?.[c.id] ?? {};
      for (let m = 1; m <= 12; m++) {
        const inv = cells[m];
        if (!inv) continue;
        invoiceCount++;
        totalInvoiced += Number(inv.amount) || 0;
        totalPaid += Number(inv.amount_paid) || 0;
        if (inv.status === "paid") paidCount++;
      }
    }
    return {
      totalInvoiced,
      totalPaid,
      invoiceCount,
      paidCount,
      outstanding: Math.max(0, totalInvoiced - totalPaid),
    };
  }, [filtered, invoiceMap]);

  const isLoading = creatorsLoading || invoicesLoading;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Talent Paying Us — invoices</h2>
          <p className="text-sm text-muted-foreground">
            One invoice per creator per month. Click any month cell to view or
            create the invoice. The Calculator section computes the amount.
          </p>
        </div>
        <Button onClick={openCreateBlank} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add invoice
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by creator name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
          {creators?.length
            ? "No creators match that search."
            : "No signed creators yet — add them via Roster."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
                <TableHead className="sticky left-0 z-10 min-w-[180px] bg-muted/40">
                  Creator
                </TableHead>
                {MONTHS.map((m) => (
                  <TableHead key={m} className="min-w-[80px] text-center">
                    {m}
                  </TableHead>
                ))}
                <TableHead className="min-w-[100px] text-right">YTD invoiced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const cells = invoiceMap?.[c.id] ?? {};
                let creatorTotal = 0;
                for (let m = 1; m <= 12; m++) {
                  const inv = cells[m];
                  if (inv) creatorTotal += Number(inv.amount) || 0;
                }
                return (
                  <TableRow key={c.id} className="text-xs">
                    <TableCell className="sticky left-0 z-10 bg-background font-medium">
                      {c.name}
                    </TableCell>
                    {MONTHS.map((_label, i) => {
                      const month = i + 1;
                      const inv = cells[month];
                      const status = inv?.status ?? "unpaid";
                      const hasInv = !!inv;
                      const hasUrl = !!inv?.invoice_url;
                      return (
                        <TableCell key={month} className="p-1">
                          <button
                            type="button"
                            onClick={() => openCell(c.id, month)}
                            title={
                              inv
                                ? [
                                    inv.invoice_number || "(no invoice #)",
                                    formatUSD(Number(inv.amount), { decimals: 2 }),
                                    `due ${inv.due_date}`,
                                    status,
                                    hasUrl ? "has invoice link" : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : "Click to add an invoice for this month"
                            }
                            className={cn(
                              "block w-full rounded border px-1 py-1 text-center transition hover:ring-2 hover:ring-primary/40",
                              hasInv ? STATUS_STYLES[status] : "border-dashed border-muted-foreground/30",
                            )}
                          >
                            {hasInv ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span
                                  className={cn(
                                    "text-sm font-semibold tabular-nums",
                                    hasUrl &&
                                      "text-blue-600 underline decoration-dotted underline-offset-2 dark:text-blue-400",
                                  )}
                                >
                                  {formatUSDCompact(Number(inv.amount))}
                                </span>
                                <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider opacity-80">
                                  {inv.invoice_number || "—"}
                                  {hasUrl && <ExternalLink className="h-2.5 w-2.5" />}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">+</span>
                            )}
                          </button>
                        </TableCell>
                      );
                    })}
                    <TableCell
                      className="text-right font-semibold tabular-nums"
                      title={formatUSD(creatorTotal, { decimals: 2 })}
                    >
                      {creatorTotal > 0 ? formatUSD(creatorTotal, { decimals: 0 }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border bg-muted/15 p-3 text-xs">
          <Stat label="Invoices" value={`${totals.paidCount}/${totals.invoiceCount} paid`} />
          <Stat label="Total invoiced" value={formatUSD(totals.totalInvoiced, { decimals: 2 })} />
          <Stat label="Total paid" value={formatUSD(totals.totalPaid, { decimals: 2 })} />
          <Stat label="Outstanding" value={formatUSD(totals.outstanding, { decimals: 2 })} emphasised />
        </div>
      )}

      {dialogOpen && (
        <TalentInvoiceDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setDialogOpen(false);
              setEditing(null);
              setCreating(null);
            }
          }}
          invoice={editing}
          defaultCreatorId={creating?.creatorId}
          defaultYear={creating?.year}
          defaultMonth={creating?.month}
        />
      )}
    </div>
  );
}

function Stat({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          emphasised ? "text-xl font-semibold" : "text-base font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}
