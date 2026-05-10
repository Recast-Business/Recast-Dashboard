import * as React from "react";
import { ExternalLink, Skull } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useCampaignCreatorsByCampaigns } from "@/hooks/useCampaignCreators";
import { useCampaignPaymentsByCreators } from "@/hooks/useCampaignPayments";
import { ExportCSVButton } from "@/components/ui/export-csv-button";
import { ExportPDFButton } from "@/components/ui/export-pdf-button";
import type { CSVColumn } from "@/lib/export/csv";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { PieCard } from "@/components/analytics/PieCard";
import { groupSum } from "@/lib/analytics/group";
import type { CampaignStatusV2, CampaignV2 } from "@/types/finance";
import { cn, formatUSD } from "@/lib/utils";

const STATUS_STYLES: Record<CampaignStatusV2, string> = {
  pending: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-900",
  awaiting_payment: "bg-amber-100 text-amber-900",
  overdue: "bg-rose-100 text-rose-900",
  completed: "bg-sky-100 text-sky-900",
};

interface Props {
  year: number;
}

/**
 * Finance-side summary of every campaign for the year.
 * Read-only — click "Open" on any row to jump to /campaigns for editing.
 *
 * Each campaign's totals are computed by summing the per-month payment
 * grid for every attached creator: gross_ytd = Σ amount, recast_ytd =
 * Σ (amount × effective commission %), outstanding = Σ amount where
 * status != paid.
 */
export function EFuseIncomeSummary({ year }: Props) {
  const { data: campaigns, isLoading, error } = useCampaigns();

  const campaignIds = React.useMemo(() => (campaigns ?? []).map((c) => c.id), [campaigns]);
  const { data: creatorsByCampaign } = useCampaignCreatorsByCampaigns(campaignIds);

  const allCcIds = React.useMemo(() => {
    if (!creatorsByCampaign) return [];
    const ids: string[] = [];
    for (const list of Object.values(creatorsByCampaign)) {
      for (const cc of list) ids.push(cc.id);
    }
    return ids;
  }, [creatorsByCampaign]);
  const { data: paymentsByCC } = useCampaignPaymentsByCreators(allCcIds, year);

  // Compute per-campaign + grand totals once, memoised
  const totalsByCampaign = React.useMemo(() => {
    const out: Record<string, { creators: number; gross: number; recast: number; outstanding: number }> = {};
    if (!campaigns || !creatorsByCampaign) return out;
    for (const c of campaigns) {
      const ccs = creatorsByCampaign[c.id] ?? [];
      let gross = 0;
      let recast = 0;
      let outstanding = 0;
      for (const cc of ccs) {
        const pct = cc.commission_pct != null ? cc.commission_pct : c.default_commission_pct;
        const cells = paymentsByCC?.[cc.id] ?? {};
        for (const p of Object.values(cells)) {
          const amt = Number(p.amount) || 0;
          gross += amt;
          recast += amt * (pct / 100);
          if (p.status !== "paid") outstanding += amt;
        }
      }
      out[c.id] = { creators: ccs.length, gross, recast, outstanding };
    }
    return out;
  }, [campaigns, creatorsByCampaign, paymentsByCC]);

  const grand = React.useMemo(() => {
    let creators = 0;
    let gross = 0;
    let recast = 0;
    let outstanding = 0;
    for (const t of Object.values(totalsByCampaign)) {
      creators += t.creators;
      gross += t.gross;
      recast += t.recast;
      outstanding += t.outstanding;
    }
    return { creators, gross, recast, outstanding };
  }, [totalsByCampaign]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-h3">Overlay income</h2>
          <p className="text-sm text-muted-foreground">
            Per-campaign performance for {year}. Campaigns themselves are managed on{" "}
            <Link to="/campaigns" className="underline hover:text-foreground">
              /campaigns
            </Link>{" "}
            — this view is read-only.
          </p>
        </div>
        {(() => {
          const exportColumns: CSVColumn<CampaignV2>[] = [
            { header: "Brand", value: (c) => c.brand },
            { header: "Campaign", value: (c) => c.name },
            { header: "Status", value: (c) => c.status },
            { header: "Creators", value: (c) => totalsByCampaign[c.id]?.creators ?? 0 },
            { header: "Gross YTD", value: (c) => (totalsByCampaign[c.id]?.gross ?? 0).toFixed(2) },
            { header: "Recast YTD", value: (c) => (totalsByCampaign[c.id]?.recast ?? 0).toFixed(2) },
            { header: "Outstanding", value: (c) => (totalsByCampaign[c.id]?.outstanding ?? 0).toFixed(2) },
          ];
          return (
            <div className="flex items-center gap-2">
              <ExportCSVButton
                filename={`efuse-income-${year}.csv`}
                rows={campaigns ?? []}
                columns={exportColumns}
              />
              <ExportPDFButton
                filename={`efuse-income-${year}.pdf`}
                title={`Overlay income — ${year}`}
                subtitle="Per-campaign rollup"
                rows={campaigns ?? []}
                columns={exportColumns}
              />
            </div>
          );
        })()}
      </div>

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

      {!isLoading && !error && (campaigns ?? []).length === 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Skull className="h-4 w-4 shrink-0" />
          No campaigns yet. Head to{" "}
          <Link to="/campaigns" className="underline">
            /campaigns
          </Link>{" "}
          to create one.
        </div>
      )}

      {(campaigns ?? []).length > 0 && (
        <AnalyticsPanel storageKey="recast.analytics.efuse" title="Overlay analytics">
          {() => (
            <>
              <PieCard
                title="Gross by brand"
                data={groupSum(campaigns ?? [], {
                  key: (c) => c.brand,
                  value: (c) => totalsByCampaign[c.id]?.gross ?? 0,
                  topN: 8,
                })}
              />
              <PieCard
                title="Recast YTD by brand"
                data={groupSum(campaigns ?? [], {
                  key: (c) => c.brand,
                  value: (c) => totalsByCampaign[c.id]?.recast ?? 0,
                  topN: 8,
                })}
              />
              <PieCard
                title="By status"
                data={groupSum(campaigns ?? [], {
                  key: (c) => c.status.replace(/_/g, " "),
                  value: (c) => totalsByCampaign[c.id]?.gross ?? 0,
                })}
              />
            </>
          )}
        </AnalyticsPanel>
      )}

      {(campaigns ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 text-[10px] uppercase tracking-wider">
                <TableHead className="min-w-[140px]">Brand</TableHead>
                <TableHead className="min-w-[180px]">Campaign</TableHead>
                <TableHead className="min-w-[110px]">Status</TableHead>
                <TableHead className="min-w-[80px] text-right">Creators</TableHead>
                <TableHead className="min-w-[110px] text-right">Gross YTD</TableHead>
                <TableHead className="min-w-[120px] text-right">Recast YTD</TableHead>
                <TableHead className="min-w-[120px] text-right">Outstanding</TableHead>
                <TableHead className="min-w-[60px] text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns ?? []).map((c) => {
                const t = totalsByCampaign[c.id];
                const ready = !!creatorsByCampaign && !!paymentsByCC;
                return (
                  <TableRow key={c.id} className="text-xs">
                    <TableCell className="font-medium">{c.brand}</TableCell>
                    <TableCell className="truncate">{c.name}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                          STATUS_STYLES[c.status],
                        )}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ready ? t?.creators ?? 0 : "…"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {ready ? formatUSD(t?.gross ?? 0, { decimals: 2 }) : "…"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {ready ? formatUSD(t?.recast ?? 0, { decimals: 2 }) : "…"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        (t?.outstanding ?? 0) > 0 && "font-semibold text-amber-700",
                      )}
                    >
                      {ready ? formatUSD(t?.outstanding ?? 0, { decimals: 2 }) : "…"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to="/campaigns"
                        className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
                        title="Open in Campaigns"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/30 text-xs font-semibold">
                <TableCell colSpan={3}>TOTALS</TableCell>
                <TableCell className="text-right tabular-nums">{grand.creators}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUSD(grand.gross, { decimals: 2 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUSD(grand.recast, { decimals: 2 })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUSD(grand.outstanding, { decimals: 2 })}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
